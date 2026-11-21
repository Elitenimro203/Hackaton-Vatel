// Appels Supabase du module Files d'attente : affluence d'un jour par créneau et réglages des guichets.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Réglages par défaut si la table reglages_file n'est pas encore créée
export const REGLAGES_PAR_DEFAUT = { guichets: 2, sec_sans_ticket: 30, sec_avec_ticket: 20 }

// Charge l'affluence du jour (7 créneaux de 11 h 50 à 12 h 50) et les réglages.
// Renvoie { creneaux: [{ creneau: '12:00:00', reservations }], reglages, erreur } ; creneaux est vide si le module n'est pas installé.
export async function chargerAffluence(jour) {
  const [affluence, reglages] = await Promise.all([
    supabase.rpc('affluence_creneaux', { p_jour: jour }),
    supabase.from('reglages_file').select('guichets, sec_sans_ticket, sec_avec_ticket').eq('id', 1).maybeSingle(),
  ])
  const erreur = affluence.error || reglages.error
  return {
    creneaux: affluence.data || [],
    reglages: reglages.data || REGLAGES_PAR_DEFAUT,
    erreur: erreur ? traduireErreur(erreur) : null,
  }
}
