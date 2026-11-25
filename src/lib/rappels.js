// Rappels de réservation (calculs purs) : temps restant avant la veille 18 h et jour de service raté sans réservation.
import { ajouterJours } from './formatage'

const ESPACE = '\u00A0'

// En dessous de 6 heures avant l'heure limite, le rappel passe en « urgent »
export const MINUTES_RAPPEL_URGENT = 6 * 60

// Même règle que la base : la veille du repas à 18 h, heure d'Abidjan (UTC+0)
export function heureLimite(jourIso) {
  return new Date(`${ajouterJours(jourIso, -1)}T18:00:00Z`)
}

export function minutesAvantLimite(jourIso, maintenant) {
  return Math.floor((heureLimite(jourIso) - maintenant) / 60000)
}

// 135 → « 2 h 15 », 40 → « 40 min »
export function formaterTempsRestant(minutes) {
  if (minutes < 60) return `${Math.max(minutes, 1)}${ESPACE}min`
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return reste === 0 ? `${heures}${ESPACE}h` : `${heures}${ESPACE}h${ESPACE}${String(reste).padStart(2, '0')}`
}

// Le prochain jour de service (après aujourd'hui) déjà fermé et sans réservation : l'élève l'a raté
export function jourRate(menus, reservations, aujourdhui, maintenant) {
  const joursAvecReservation = new Set(
    reservations.map((reservation) => menus.find((menu) => menu.id === reservation.menu_id)?.jour),
  )
  const prochainJourDeService = menus.map((menu) => menu.jour).filter((jour) => jour > aujourdhui).sort()[0]
  if (!prochainJourDeService) return null
  const ferme = minutesAvantLimite(prochainJourDeService, maintenant) <= 0
  return ferme && !joursAvecReservation.has(prochainJourDeService) ? prochainJourDeService : null
}
