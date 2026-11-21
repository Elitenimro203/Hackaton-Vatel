// Avis de l'élève sur ses repas servis : lecture de ses notes (RLS) et envoi par noter_repas() (modifiable à tout moment).
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

export const LONGUEUR_MAX_MOT = 280

// Notes déjà données par l'élève, rangées par menu : { 12: { etoiles: 4, commentaire: '…' } }
export async function chargerMesAvis(idEleve) {
  const { data, error } = await supabase
    .from('avis')
    .select('menu_id, etoiles, commentaire')
    .eq('eleve_id', idEleve)
    .not('menu_id', 'is', null)
  const parMenu = {}
  ;(data || []).forEach((avis) => {
    parMenu[avis.menu_id] = { etoiles: avis.etoiles, commentaire: avis.commentaire || '' }
  })
  return { avis: parMenu, erreur: error ? traduireErreur(error) : null }
}

// Renvoie null si l'avis est enregistré, sinon le message d'erreur en français
export async function noterRepas(idMenu, etoiles, commentaire) {
  const mot = commentaire.trim()
  const { data, error } = await supabase.rpc('noter_repas', {
    p_menu_id: idMenu,
    p_etoiles: etoiles,
    p_commentaire: mot === '' ? null : mot,
  })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}
