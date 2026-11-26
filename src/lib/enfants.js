// Appels Supabase de l'espace parent : ses enfants liés (la RLS ne montre qu'eux), lier un enfant par e-mail et le délier.
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

// Renvoie null si l'enfant est lié, sinon le message d'erreur en français (e-mail inconnu, pas un élève, déjà lié)
export async function lierEnfant(email) {
  const { data, error } = await supabase.rpc('lier_enfant', { p_email: email.trim() })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
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
