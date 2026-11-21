// Mise en forme des montants (« 1 000 F », « 684 000 FCFA ») et des dates (« lundi 23 novembre »).
const ESPACE_INSECABLE = '\u00A0'
const FUSEAU_CANTINE = 'Africa/Abidjan'

// Heures du service de midi, affichées sur la fiche et le ticket
export const HORAIRE_SERVICE = '12 h – 14 h'

export function formaterMontant(montant, unite = 'F') {
  const nombre = Math.round(Number(montant) || 0)
  const chiffres = Math.abs(nombre).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE)
  return `${nombre < 0 ? '−' : ''}${chiffres}${ESPACE_INSECABLE}${unite}`
}

// « 3 002 » : un nombre avec ses milliers séparés
export function formaterNombre(nombre) {
  return formaterMontant(nombre, '').trim()
}

// « 6,1 % » (« — » quand il n'y a pas encore de chiffre)
export function formaterPourcent(valeur) {
  if (valeur === null || valeur === undefined) return '—'
  return `${Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${ESPACE_INSECABLE}%`
}

// Les dates des menus sont des textes 'AAAA-MM-JJ' : on les lit à midi UTC pour ne jamais changer de jour
function lireJour(jourIso) {
  return new Date(`${jourIso}T12:00:00Z`)
}

function ecrireJour(date) {
  return date.toISOString().slice(0, 10)
}

// Date du jour à Abidjan, au format 'AAAA-MM-JJ'
export function dateDuJour() {
  return new Date().toLocaleDateString('en-CA', { timeZone: FUSEAU_CANTINE })
}

export function ajouterJours(jourIso, nombreDeJours) {
  const date = lireJour(jourIso)
  date.setUTCDate(date.getUTCDate() + nombreDeJours)
  return ecrireJour(date)
}

// 0 = dimanche, 6 = samedi
export function numeroJourSemaine(jourIso) {
  return lireJour(jourIso).getUTCDay()
}

// Les 5 jours (lundi à vendredi) de la semaine en cours, ou de la suivante le week-end
export function joursOuvresDeLaSemaine(jourIso) {
  const numero = numeroJourSemaine(jourIso)
  const decalageVersLundi = numero === 0 ? 1 : numero === 6 ? 2 : 1 - numero
  const lundi = ajouterJours(jourIso, decalageVersLundi)
  return [0, 1, 2, 3, 4].map((ecart) => ajouterJours(lundi, ecart))
}

// « lundi 23 novembre »
export function formaterDate(jourIso) {
  return lireJour(jourIso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

// « lundi »
export function formaterNomJour(jourIso) {
  return lireJour(jourIso).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })
}

// « lun »
export function formaterJourCourt(jourIso) {
  return formaterNomJour(jourIso).slice(0, 3)
}

// « 23 »
export function formaterNumeroJour(jourIso) {
  return String(lireJour(jourIso).getUTCDate())
}

// « samedi 21 novembre 2026 »
export function formaterDateAvecAnnee(jourIso) {
  return `${formaterDate(jourIso)} ${lireJour(jourIso).getUTCFullYear()}`
}

// « lun 23 nov » (mis en majuscules par le CSS)
export function formaterDateCourte(jourIso) {
  const mois = lireJour(jourIso).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })
  return `${formaterJourCourt(jourIso)} ${formaterNumeroJour(jourIso)} ${mois.replace('.', '')}`
}

// « 23 – 27 novembre » ou « 30 novembre – 4 décembre »
export function formaterPlageSemaine(lundiIso) {
  const vendredi = ajouterJours(lundiIso, 4)
  const mois = (jourIso) => lireJour(jourIso).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })
  const debut = mois(lundiIso) === mois(vendredi)
    ? formaterNumeroJour(lundiIso)
    : `${formaterNumeroJour(lundiIso)} ${mois(lundiIso)}`
  return `${debut} – ${formaterNumeroJour(vendredi)} ${mois(vendredi)}`
}

// « CJ · 0812 » : le code de retrait tel qu'on le montre à la cantine
export function formaterCodeRetrait(code) {
  return `CJ · ${code}`
}

// « 21 nov. · 14 h 05 » : date et heure d'un mouvement, à l'heure d'Abidjan
export function formaterDateHeure(horodatage) {
  const date = new Date(horodatage)
  const jour = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: FUSEAU_CANTINE })
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU_CANTINE })
  return `${jour} · ${heure.replace(':', ' h ')}`
}

// « 11 h 45 » : heure d'un horodatage, à l'heure d'Abidjan
export function formaterHeure(horodatage) {
  const heure = new Date(horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU_CANTINE })
  return heure.replace(':', ' h ')
}

// « 26 oct » : jour et mois abrégé (axe des graphiques)
export function formaterJourMois(jourIso) {
  const mois = lireJour(jourIso).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })
  return `${formaterNumeroJour(jourIso)} ${mois.replace('.', '')}`
}

// « 18 novembre » : le jour et le mois en toutes lettres
export function formaterJourMoisLong(jourIso) {
  const mois = lireJour(jourIso).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })
  return `${formaterNumeroJour(jourIso)} ${mois}`
}

// « octobre » : le mois qui précède celui de ce jour
export function formaterMoisPrecedent(jourIso) {
  const dernierJourDuMoisPrecedent = ajouterJours(`${jourIso.slice(0, 8)}01`, -1)
  return lireJour(dernierJourDuMoisPrecedent).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })
}

// '12:30:00' → « 12 h 30 » : heure d'un créneau de passage
export function formaterCreneau(heure) {
  const [heures, minutes] = heure.split(':')
  return `${Number(heures)} h ${minutes}`
}

// Attente prévue d'un créneau : « < 1 min », « ~4 min », « 10 min et + » (créneau saturé)
export function formaterAttente(minutes) {
  if (minutes === null || minutes === undefined) return '10 min et +'
  if (minutes < 1) return '< 1 min'
  return `~${Math.round(minutes)}${'\u00A0'}min`
}

// « 17,9 min » : une attente en minutes, avec une décimale
export function formaterMinutes(minutes) {
  return `${Number(minutes).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00A0min`
}

// « 1,5 » : quantité de stock avec au plus 2 décimales
export function formaterNombreStock(quantite) {
  return Number(quantite).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

// « 12 kg », « 40 L », « 150 pièce » : quantité de stock avec son unité collée par une espace insécable
export function formaterQuantite(quantite, unite) {
  return `${formaterNombreStock(quantite)}${ESPACE_INSECABLE}${unite}`
}
