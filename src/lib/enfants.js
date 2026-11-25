// Appels Supabase du lien parent ↔ enfant : enfants liés (la RLS ne montre qu'eux), code d'invitation créé par l'élève, liaison par ce code, déliaison.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { avecNomPropre, prenomAffiche } from './formatage'

// Profils élèves visibles par le parent connecté : uniquement ses enfants liés
export async function chargerEnfants() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nom, solde, allergies, regime, autre_allergie, type_usager')
    .eq('role', 'eleve')
    .order('nom', { ascending: true })
  return { enfants: (data || []).map(avecNomPropre), erreur: error ? traduireErreur(error) : null }
}

// Longueur du code d'invitation, et mise en forme « 7TV · MWM »
export const LONGUEUR_CODE_PARENT = 6

export function nettoyerCodeParent(texte) {
  return (texte || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LONGUEUR_CODE_PARENT)
}

export function formaterCodeParent(code) {
  const propre = nettoyerCodeParent(code)
  return propre.length > 3 ? `${propre.slice(0, 3)} · ${propre.slice(3)}` : propre
}

// Parent : se lie à l'enfant qui lui a donné ce code. Renvoie null si c'est fait, sinon le message d'erreur en français
export async function lierEnfantAvecCode(code) {
  const { data, error } = await supabase.rpc('lier_enfant_avec_code', { p_code: nettoyerCodeParent(code) })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// Élève : son code encore valable, s'il en a un. Renvoie { code, expireLe } ou null
export async function chargerMonCodeParent(idEleve) {
  const { data } = await supabase
    .from('codes_parent')
    .select('code, expire_le')
    .eq('eleve_id', idEleve)
    .gt('expire_le', new Date().toISOString())
    .maybeSingle()
  return data ? { code: data.code, expireLe: data.expire_le } : null
}

// Élève : crée un nouveau code (valable 24 h, un seul usage). Renvoie { code, expireLe, erreur }
export async function creerCodeParent() {
  const { data, error } = await supabase.rpc('creer_code_parent')
  if (error) return { code: null, expireLe: null, erreur: traduireErreur(error) }
  if (!data?.ok) return { code: null, expireLe: null, erreur: data?.message || 'Impossible de créer le code.' }
  return { code: data.code, expireLe: data.expire_le, erreur: null }
}

// Élève : les parents liés à son compte ({ id, nom })
export async function chargerMesParents() {
  const { data, error } = await supabase.rpc('mes_parents')
  return { parents: (data || []).map(avecNomPropre), erreur: error ? traduireErreur(error) : null }
}

// Retire le lien avec cet enfant (la RLS n'autorise que les liens du parent connecté). Renvoie null si c'est fait.
export async function delierEnfant(idEnfant) {
  const { data, error } = await supabase.from('liens_parent').delete().eq('eleve_id', idEnfant).select('eleve_id')
  if (error) return traduireErreur(error)
  return data && data.length > 0 ? null : 'Cet enfant n’est pas lié à votre compte.'
}

// Prénom affiché dans les cartes et les bandeaux (« awa koné » → « Awa »)
export function prenomDe(enfant) {
  return prenomAffiche(enfant.nom, 'Votre enfant')
}
