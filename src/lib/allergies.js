// Appels Supabase du profil alimentaire : modification par l'élève ou son parent, et allergies du jour pour la cuisine.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Renvoie null si les allergies sont enregistrées, sinon le message d'erreur en français
export async function modifierAllergies(idEleve, allergies) {
  const { data, error } = await supabase.rpc('modifier_allergies', { p_eleve_id: idEleve, p_allergies: allergies })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// Prochain jour de service (aujourd'hui s'il y a un menu, sinon le suivant), au format 'AAAA-MM-JJ'
export async function chargerProchainJourDeService(aujourdhui) {
  const { data, error } = await supabase
    .from('menus')
    .select('jour')
    .gte('jour', aujourdhui)
    .order('jour', { ascending: true })
    .limit(1)
  return { jour: data?.[0]?.jour || aujourdhui, erreur: error ? traduireErreur(error) : null }
}

// Admin : élèves allergiques qui mangent ce jour-là, avec le plat choisi et les allergènes à risque
export async function chargerAllergiesDuJour(jour) {
  const { data, error } = await supabase.rpc('allergies_du_jour', { p_jour: jour })
  return { lignes: data || [], erreur: error ? traduireErreur(error) : null }
}
