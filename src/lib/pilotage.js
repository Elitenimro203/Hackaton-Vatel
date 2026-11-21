// Appels Supabase du tableau de bord admin : chiffres du mois, prévision, historique réservés/servis et favoris (tout est calculé en SQL).
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Charge les 4 blocs du tableau de bord en parallèle.
// Renvoie { chiffres, prevision, historique, favoris, erreur } ; chiffres vaut null si la base ne renvoie rien.
export async function chargerTableauDeBord() {
  const [chiffres, prevision, historique, favoris] = await Promise.all([
    supabase.rpc('chiffres_pilotage'),
    supabase.rpc('prevision_semaine'),
    supabase.rpc('historique_service', { p_semaines: 4 }),
    supabase.rpc('favoris_cantine', { p_limite: 3 }),
  ])
  const premiereErreur = [chiffres, prevision, historique, favoris].find((reponse) => reponse.error)?.error

  return {
    chiffres: chiffres.data?.[0] ?? null,
    prevision: prevision.data || [],
    historique: historique.data || [],
    favoris: favoris.data || [],
    erreur: premiereErreur ? traduireErreur(premiereErreur) : null,
  }
}
