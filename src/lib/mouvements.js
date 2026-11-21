// Appels Supabase de l'historique du solde (recharges, repas, remboursements) : lecture seule, protégée par RLS.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Derniers mouvements de l'élève, du plus récent au plus ancien
export async function chargerMesMouvements(idEleve) {
  const { data, error } = await supabase
    .from('mouvements')
    .select('id, montant, motif, cree_le')
    .eq('eleve_id', idEleve)
    .order('cree_le', { ascending: false })
    .limit(15)
  return { mouvements: data || [], erreur: error ? traduireErreur(error) : null }
}
