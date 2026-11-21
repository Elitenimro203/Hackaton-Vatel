// Calculs de la file d'attente (modèle de Markov M/M/c, formule d'Erlang C) : fonctions pures, sans bibliothèque ni Supabase.

// Durée d'un créneau de passage, en minutes
export const DUREE_CRENEAU = 10

// Seuils des badges, en minutes d'attente
const SEUIL_CALME = 3
const SEUIL_CHARGE = 8

// Attente moyenne dans la file (en minutes) d'après Erlang C.
// lambda : élèves qui arrivent par minute ; mu : élèves servis par minute à un guichet ; c : guichets ouverts.
// Renvoie null si le créneau est saturé (les guichets ne suivent pas : lambda ≥ c × mu).
export function erlangC(lambda, mu, c) {
  if (lambda <= 0) return 0
  const a = lambda / mu
  const occupation = a / c
  if (occupation >= 1) return null

  // somme des a^k / k! pour k = 0 à c − 1, et terme = a^c / c! à la fin de la boucle
  let somme = 0
  let terme = 1
  for (let k = 0; k < c; k += 1) {
    somme += terme
    terme *= a / (k + 1)
  }
  const partAttente = terme / (1 - occupation)
  const probabiliteAttendre = partAttente / (somme + partAttente)
  return probabiliteAttendre / (c * mu - lambda)
}

// Attente prévue pour chaque créneau, dans l'ordre (comptes = réservations par créneau de 10 min).
// La file qui reste à la fin d'un créneau chargé est reportée sur le suivant :
// file_reportée = max(0, file_précédente + (lambda − c × mu) × 10), qui ajoute file_reportée ÷ (c × mu) minutes d'attente.
// Renvoie une liste de minutes, ou null pour un créneau saturé.
export function attentesParCreneau(comptes, mu, c) {
  let fileReportee = 0
  return comptes.map((nombre) => {
    const lambda = nombre / DUREE_CRENEAU
    const attenteDuCreneau = erlangC(lambda, mu, c)
    const attenteDuReport = fileReportee / (c * mu)
    fileReportee = Math.max(0, fileReportee + (lambda - c * mu) * DUREE_CRENEAU)
    return attenteDuCreneau === null ? null : attenteDuCreneau + attenteDuReport
  })
}

// Badge d'un créneau : 'calme' (moins de 3 min), 'normal', ou 'charge' (plus de 8 min ou saturé)
export function badge(attente) {
  if (attente === null || attente > SEUIL_CHARGE) return 'charge'
  if (attente < SEUIL_CALME) return 'calme'
  return 'normal'
}

// Nombre maximum de réservations dans un créneau : 75 % de ce que les guichets servent en 10 min
export function plafond(mu, c) {
  return Math.floor(0.75 * c * mu * DUREE_CRENEAU)
}

// Guichet : élèves servis par minute, à partir des secondes par élève (20 s avec le ticket → 3 par minute)
export function servisParMinute(secondesParEleve) {
  return 60 / secondesParEleve
}

// '12:10:00' → 730 (minutes depuis minuit)
function minutesDepuisMinuit(heure) {
  const [heures, minutes] = heure.split(':').map(Number)
  return heures * 60 + minutes
}

const MIDI = 12 * 60

// Prépare les pastilles à partir de l'affluence lue en base : attente prévue, badge et « Complet » pour chaque créneau.
// lignes = [{ creneau: '12:00:00', reservations: 60 }] ; reglages = { guichets, sec_avec_ticket }.
export function preparerCreneaux(lignes, reglages) {
  const mu = servisParMinute(reglages.sec_avec_ticket)
  const c = reglages.guichets
  const maximum = plafond(mu, c)
  const attentes = attentesParCreneau(lignes.map((ligne) => ligne.reservations), mu, c)
  return lignes.map((ligne, position) => ({
    creneau: ligne.creneau,
    reservations: ligne.reservations,
    attente: attentes[position],
    badge: badge(attentes[position]),
    complet: ligne.reservations >= maximum,
  }))
}

// Créneau mis en avant : le créneau calme (et pas complet) le plus proche de 12 h 00, plutôt après en cas d'égalité ;
// sinon le créneau libre qui attend le moins. Renvoie null si tout est complet.
export function creneauConseille(creneaux) {
  const libres = creneaux.filter((creneau) => !creneau.complet)
  const ecartAMidi = (creneau) => Math.abs(minutesDepuisMinuit(creneau.creneau) - MIDI) - (minutesDepuisMinuit(creneau.creneau) >= MIDI ? 0.5 : 0)
  const calmes = libres.filter((creneau) => creneau.badge === 'calme').sort((a, b) => ecartAMidi(a) - ecartAMidi(b))
  if (calmes.length > 0) return calmes[0].creneau
  const parAttente = libres.filter((creneau) => creneau.attente !== null).sort((a, b) => a.attente - b.attente)
  return parAttente[0]?.creneau ?? null
}

// ---------------------------------------------------------------------------
// Simulation admin : équations de Kolmogorov (formule 2 du module), file exacte minute par minute
// ---------------------------------------------------------------------------

const ETATS_MAX = 300
const PAS_SECONDE = 1
const MINUTES_DE_VIDAGE = 30

// Profil « avant » : tout le monde à la sonnerie. Profil « lissé » : tout le monde suit le conseil (300 élèves, section 4).
export const CRENEAUX_SIMULATION = ['11:50', '12:00', '12:10', '12:20', '12:30', '12:40', '12:50']
export const PROFIL_AVANT = [10, 120, 70, 40, 30, 20, 10]
export const PROFIL_LISSE = [45, 45, 45, 45, 45, 45, 30]

// Profil mélangé : (1 − adhesion) × avant + adhesion × lissé, adhesion entre 0 et 1
export function melangerProfils(adhesion) {
  return PROFIL_AVANT.map((avant, position) => (1 - adhesion) * avant + adhesion * PROFIL_LISSE[position])
}

// Fait évoluer la loi de probabilité p[n] (n = élèves présents, file + guichets) pas à pas, 1 seconde à la fois :
// p[n] ← p[n] + dt × ( λ·p[n−1] + min(n+1, c)·μ·p[n+1] − (λ + min(n, c)·μ)·p[n] ).
// profil : élèves attendus par créneau de 10 min ; mu : élèves servis par minute et par guichet ; c : guichets ouverts.
// Renvoie { attenteMoyenne (minutes), fileMax (élèves), courbe (file moyenne à chaque minute, la 1re minute = 11 h 50) }.
export function simulerKolmogorov(profil, mu, c) {
  const dt = PAS_SECONDE / 60
  const muParSeconde = mu / 60
  const secondesParCreneau = DUREE_CRENEAU * 60
  const totalEleves = profil.reduce((somme, nombre) => somme + nombre, 0)
  const nombreDeSecondes = profil.length * secondesParCreneau + MINUTES_DE_VIDAGE * 60

  let loi = new Float64Array(ETATS_MAX + 1)
  let suivante = new Float64Array(ETATS_MAX + 1)
  loi[0] = 1

  let sommeFile = 0
  let fileMax = 0
  const courbe = []
  let sommeMinute = 0

  for (let seconde = 0; seconde < nombreDeSecondes; seconde += 1) {
    const creneau = Math.floor(seconde / secondesParCreneau)
    const lambda = creneau < profil.length ? profil[creneau] / secondesParCreneau : 0

    for (let n = 0; n <= ETATS_MAX; n += 1) {
      const entrees = (n > 0 ? lambda * loi[n - 1] : 0) + (n < ETATS_MAX ? Math.min(n + 1, c) * muParSeconde * loi[n + 1] : 0)
      const sorties = ((n < ETATS_MAX ? lambda : 0) + Math.min(n, c) * muParSeconde) * loi[n]
      suivante[n] = loi[n] + PAS_SECONDE * (entrees - sorties)
    }
    ;[loi, suivante] = [suivante, loi]

    let fileMoyenne = 0
    for (let n = c + 1; n <= ETATS_MAX; n += 1) fileMoyenne += (n - c) * loi[n]
    sommeFile += fileMoyenne * dt
    sommeMinute += fileMoyenne
    if (fileMoyenne > fileMax) fileMax = fileMoyenne
    if ((seconde + 1) % 60 === 0) {
      courbe.push(sommeMinute / 60)
      sommeMinute = 0
    }
  }

  // Loi de Little : attente moyenne = (file moyenne × temps) ÷ nombre d'élèves
  return { attenteMoyenne: totalEleves > 0 ? sommeFile / totalEleves : 0, fileMax, courbe }
}

// Plus petit nombre de guichets (de 1 à 4) pour que l'attente prévue de chaque créneau reste ≤ 5 minutes (avec report de file).
// comptes : élèves par créneau ; renvoie un nombre de guichets par créneau (4 si même 4 ne suffisent pas).
export function guichetsConseilles(comptes, mu) {
  const ATTENTE_MAX = 5
  const GUICHETS_MAX = 4
  const attentesParGuichets = [1, 2, 3, 4].map((c) => attentesParCreneau(comptes, mu, c))
  return comptes.map((_, position) => {
    const c = attentesParGuichets.findIndex((attentes) => attentes[position] !== null && attentes[position] <= ATTENTE_MAX) + 1
    return c > 0 ? c : GUICHETS_MAX
  })
}

// Résume les guichets conseillés par créneau en une plage : « 3 guichets de 12 h 00 à 12 h 20, 2 ensuite ».
// Renvoie { maximum, debut, fin, ensuite } (heures « 12:00 »), ensuite vaut null si le nombre est le même partout.
export function plageGuichets(guichets) {
  const maximum = Math.max(...guichets)
  const premier = guichets.indexOf(maximum)
  const dernier = guichets.lastIndexOf(maximum)
  const apres = guichets[dernier + 1] ?? guichets[premier - 1] ?? null
  const finMinutes = minutesDepuisMinuit(CRENEAUX_SIMULATION[dernier]) + DUREE_CRENEAU
  const fin = `${Math.floor(finMinutes / 60)}:${String(finMinutes % 60).padStart(2, '0')}`
  return {
    maximum,
    debut: CRENEAUX_SIMULATION[premier],
    fin,
    ensuite: apres !== null && apres !== maximum ? apres : null,
  }
}
