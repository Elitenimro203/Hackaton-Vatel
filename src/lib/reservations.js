// Appels Supabase des réservations de l'élève : lecture (RLS), réservation par reserver() (plat du jour ou de remplacement, créneau de passage) et annulation.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { ajouterJours, dateDuJour } from './formatage'

// Statut technique d'une réservation → mot français et couleur du badge
export const STATUTS_RESERVATION = {
  reservee: { libelle: 'Réservé', classe: 'badge badge-attention' },
  servie: { libelle: 'Servi', classe: 'badge badge-succes' },
  annulee: { libelle: 'Annulé', classe: 'badge badge-neutre' },
  non_retire: { libelle: 'Pas retiré', classe: 'badge badge-neutre' },
}

// Badge d'une réservation : un repas réservé dont le jour est passé n'a pas été retiré au comptoir
export function statutAffiche(reservation) {
  const jourPasse = reservation.menus?.jour < dateDuJour()
  return STATUTS_RESERVATION[reservation.statut === 'reservee' && jourPasse ? 'non_retire' : reservation.statut]
}

// Réservations actives (réservées ou servies) de l'élève pour ces menus
export async function chargerMesReservations(idEleve, idsMenus) {
  if (idsMenus.length === 0) return { reservations: [], erreur: null }
  const { data, error } = await supabase
    .from('reservations')
    .select('id, menu_id, statut, code_retrait, creneau')
    .eq('eleve_id', idEleve)
    .neq('statut', 'annulee')
    .in('menu_id', idsMenus)
  return { reservations: data || [], erreur: error ? traduireErreur(error) : null }
}

// Le plat de remplacement réservé remplace le nom et la photo du plat du jour
function platReserve(reservation) {
  if (!reservation.alternative) return reservation
  const { menus } = reservation
  return {
    ...reservation,
    menus: { ...menus, plat: menus.plat_alternatif, photo_url: menus.photo_alternative || menus.photo_url },
  }
}

// Toutes les réservations de l'élève avec leur menu, la plus récente en premier (onglet Mes repas)
export async function chargerHistoriqueReservations(idEleve) {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, menu_id, statut, code_retrait, montant, alternative, creneau, cree_le, menus(jour, plat, photo_url, plat_alternatif, photo_alternative)')
    .eq('eleve_id', idEleve)
    .order('cree_le', { ascending: false })
    .limit(30)
  return { reservations: (data || []).map(platReserve), erreur: error ? traduireErreur(error) : null }
}

// Le repas réservé aujourd'hui (pour la carte cantine) : { plat, code, creneau } ou null
export async function chargerTicketDuJour(idEleve) {
  const { reservations } = await chargerHistoriqueReservations(idEleve)
  const ticket = reservations.find((reservation) => reservation.statut === 'reservee' && reservation.menus.jour === dateDuJour())
  return ticket ? { plat: ticket.menus.plat, code: ticket.code_retrait, creneau: ticket.creneau } : null
}

// Repas d'un enfant lié (la RLS ne montre que ses enfants au parent), du jour le plus récent au plus ancien
export async function chargerRepasEnfant(idEnfant) {
  const resultat = await chargerHistoriqueReservations(idEnfant)
  const repas = [...resultat.reservations].sort((a, b) => b.menus.jour.localeCompare(a.menus.jour))
  return { repas, erreur: resultat.erreur }
}

// Réserve le plat du jour, ou son plat de remplacement si alternative = true.
// accepteAllergie : l'élève a confirmé dans la fenêtre d'alerte (ses parents sont alors prévenus).
// creneau : heure de passage '12:10:00' choisie dans la rangée de créneaux, ou null (pas de créneau).
// Renvoie { erreur, alerteAllergie } : erreur vaut null si c'est réservé ; alerteAllergie liste les allergènes à risque.
export async function reserverRepas(idMenu, { accepteAllergie = false, alternative = false, creneau = null } = {}) {
  const { data, error } = await supabase.rpc('reserver', {
    p_menu_id: idMenu,
    p_creneau: creneau,
    p_accepte_allergie: accepteAllergie,
    p_alternative: alternative,
  })
  if (error) return { erreur: traduireErreur(error), alerteAllergie: null }
  return { erreur: data.ok ? null : data.message, alerteAllergie: data.alerte_allergie }
}

// Renvoie null si l'annulation est faite (et remboursée), sinon le message d'erreur en français
export async function annulerReservation(idReservation) {
  const { data, error } = await supabase.rpc('annuler', { p_reservation_id: idReservation })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// Même règle que la base : la veille du repas à 18 h, heure d'Abidjan (UTC+0, sans heure d'été)
export function reservationFermee(jourIso) {
  return new Date() >= new Date(`${ajouterJours(jourIso, -1)}T18:00:00Z`)
}
