// Appels Supabase du service au comptoir : commandes d'un jour (admin) et passage du code de retrait par marquer_servie().
import { supabase } from './supabaseClient'
import { avecNomPropre } from './formatage'
import { traduireErreur } from './authentification'

// Réservations actives d'un jour de service : nom, plat, photo, code, statut, allergies
export async function chargerCommandesDuJour(jour) {
  const { data, error } = await supabase.rpc('commandes_du_jour', { p_jour: jour })
  return { commandes: (data || []).map(avecNomPropre), erreur: error ? traduireErreur(error) : null }
}

// Sert le repas de ce code (accepte « 0812 » ou « CJ · 0812 »).
// Renvoie { resultat, erreur } : resultat = { ok, resultat, message, prenom, plat, allergies, jour }
// avec resultat.resultat = 'servi', 'deja_servi', 'pas_aujourdhui', 'inconnu' ou 'refuse'.
export async function servirRepas(code) {
  const { data, error } = await supabase.rpc('marquer_servie', { p_code: code })
  if (error) return { resultat: null, erreur: traduireErreur(error) }
  return { resultat: data, erreur: null }
}

// Compte les repas par plat (plat du jour et plat de remplacement), le plus demandé en premier
export function repartirParPlat(commandes) {
  const parPlat = new Map()
  commandes.forEach((commande) => {
    const plat = parPlat.get(commande.plat) || { plat: commande.plat, photo: commande.photo_url, portions: 0, servies: 0 }
    plat.portions += 1
    if (commande.statut === 'servie') plat.servies += 1
    parPlat.set(commande.plat, plat)
  })
  return [...parPlat.values()].sort((a, b) => b.portions - a.portions)
}
