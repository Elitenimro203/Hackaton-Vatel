// Appels Supabase du profil alimentaire (allergies, régime, autre allergie) : modification par l'élève ou son parent, et convives à surveiller pour la cuisine.
import { supabase } from './supabaseClient'
import { avecNomPropre } from './formatage'
import { traduireErreur } from './authentification'

// Enregistre allergies, régime et autre allergie. Renvoie null si c'est fait, sinon le message d'erreur en français
export async function modifierProfilAlimentaire(idEleve, { allergies, regime, autreAllergie }) {
  const { data, error } = await supabase.rpc('modifier_profil_alimentaire', {
    p_eleve_id: idEleve,
    p_allergies: allergies,
    p_regime: regime,
    p_autre_allergie: autreAllergie,
  })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// Prochain jour de service (aujourd'hui s'il y a un menu, sinon le suivant), au format 'AAAA-MM-JJ'
export async function chargerProchainJourDeService(aujourdhui) {
  const { data, error } = await supabase
    .from('menus')
    .select('jour')
    .eq('retire', false)
    .gte('jour', aujourdhui)
    .order('jour', { ascending: true })
    .limit(1)
  return { jour: data?.[0]?.jour || aujourdhui, erreur: error ? traduireErreur(error) : null }
}

// Admin : convives à surveiller ce jour-là (allergies, régime, autre allergie), avec le plat choisi et ce qui pose problème
export async function chargerAllergiesDuJour(jour) {
  const { data, error } = await supabase.rpc('allergies_du_jour', { p_jour: jour })
  return { lignes: (data || []).map(avecNomPropre), erreur: error ? traduireErreur(error) : null }
}
