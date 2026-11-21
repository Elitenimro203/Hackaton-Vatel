// Appels Supabase des alertes allergie : lecture (RLS : l'élève, ses parents, l'admin) et « marquer comme lue » par RPC.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Dernières alertes des enfants du parent connecté, la plus récente en premier
export async function chargerAlertes() {
  const { data, error } = await supabase
    .from('alertes')
    .select('id, eleve_id, allergenes, message, lue, cree_le, menus(jour)')
    .order('cree_le', { ascending: false })
    .limit(20)
  return { alertes: data || [], erreur: error ? traduireErreur(error) : null }
}

// Renvoie null si l'alerte est marquée comme lue, sinon le message d'erreur en français
export async function marquerAlerteLue(idAlerte) {
  const { data, error } = await supabase.rpc('marquer_alerte_lue', { p_alerte_id: idAlerte })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}
