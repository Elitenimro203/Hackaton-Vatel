// Appels Supabase de la recharge du solde : Mobile Money simulé (élève, parent), crédit manuel et recherche (admin).
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

export const OPERATEURS = ['Wave', 'Orange Money', 'MTN MoMo']
export const MONTANTS_RAPIDES = [2000, 5000, 10000]
export const MONTANTS_ADMIN = [1000, 5000, 10000]
export const MONTANT_MAX_ADMIN = 100000
export const DUREE_SIMULATION = 2000

// Seuil unique de l'alerte « Solde bas » (élève, employé et parent)
export const SEUIL_SOLDE_BAS = 2000

// Le solde est bas sous 2 000 F
export function soldeEstBas(solde) {
  return solde < SEUIL_SOLDE_BAS
}

// Garde seulement les chiffres d'un numéro (« 07 08 09 10 11 » → « 0708091011 »)
export function chiffresDuNumero(numero) {
  return numero.replace(/\D/g, '').slice(0, 10)
}

// Un numéro ivoirien compte 10 chiffres
export function numeroValide(numero) {
  return chiffresDuNumero(numero).length === 10
}

// « 0708091011 » → « 07 08 09 10 11 »
export function formaterNumero(numero) {
  return chiffresDuNumero(numero).replace(/(\d{2})(?=\d)/g, '$1 ')
}

// Solde à jour d'un compte (le sien, celui d'un enfant lié ou n'importe lequel pour l'admin)
async function lireSolde(idEleve) {
  const { data } = await supabase.from('profiles').select('solde').eq('id', idEleve).maybeSingle()
  return data ? data.solde : null
}

// Renvoie { erreur, nouveauSolde } : erreur vaut null si la recharge est faite
export async function rechargerMobileMoney(idEleve, montant, operateur) {
  const { data, error } = await supabase.rpc('recharger_mobile_money', {
    p_eleve_id: idEleve,
    p_montant: montant,
    p_operateur: operateur,
  })
  if (error) return { erreur: traduireErreur(error), nouveauSolde: null }
  if (data !== 'ok') return { erreur: data, nouveauSolde: null }
  return { erreur: null, nouveauSolde: await lireSolde(idEleve) }
}

// Crédit manuel par l'admin. Renvoie { erreur, nouveauSolde }
export async function crediterCompte(idEleve, montant, motif) {
  const { data, error } = await supabase.rpc('crediter', {
    p_eleve_id: idEleve,
    p_montant: montant,
    p_motif: motif,
  })
  if (error) return { erreur: traduireErreur(error), nouveauSolde: null }
  if (data !== 'ok') return { erreur: data, nouveauSolde: null }
  return { erreur: null, nouveauSolde: await lireSolde(idEleve) }
}

// Élèves et employés dont le nom ou l'e-mail contient le texte (2 lettres minimum, admin seulement)
export async function chercherPersonnes(texte) {
  const { data, error } = await supabase.rpc('chercher_personnes', { p_texte: texte })
  return { personnes: data || [], erreur: error ? traduireErreur(error) : null }
}
