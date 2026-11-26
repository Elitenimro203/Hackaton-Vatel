// Régimes alimentaires du profil (proposés ou écrits à la main) et ce que contient un plat : dit si un plat convient (même règle que conflit_regime en SQL).

export const REGIMES = [
  { valeur: 'aucun', icone: 'a-table', libelle: 'Pas de régime', detail: 'Je mange de tout' },
  { valeur: 'vegetarien', icone: 'feuille', libelle: 'Végétarien', detail: 'Ni viande ni poisson' },
  { valeur: 'sans_porc', icone: 'porc', libelle: 'Sans porc', detail: 'Le reste me va' },
  { valeur: 'halal', icone: 'viande', libelle: 'Halal', detail: 'Sans porc, viande halal' },
]

// Ce que l'admin coche sur un plat (le poisson est déjà dans les allergènes)
export const CONTENUS = [
  { valeur: 'viande', icone: 'viande', libelle: 'Viande' },
  { valeur: 'porc', icone: 'porc', libelle: 'Porc' },
  { valeur: 'non_halal', icone: 'alerte', libelle: 'Viande non halal' },
]

const LONGUEUR_MINI_MOT = 4

// Valeur du choix « Autre » dans le formulaire (jamais enregistrée telle quelle : on enregistre le texte écrit)
export const REGIME_AUTRE = 'autre'
export const LONGUEUR_MAX_REGIME = 40

// Un régime écrit à la main (« Sans gluten », « Pas de bœuf ») n'est pas dans les propositions
export function regimeEstPersonnel(valeur) {
  return Boolean(valeur) && !REGIMES.some((regime) => regime.valeur === valeur)
}

export function trouverRegime(valeur) {
  if (regimeEstPersonnel(valeur)) {
    const libelle = valeur.trim()
    return { valeur, icone: 'feuille', libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1), detail: '' }
  }
  return REGIMES.find((regime) => regime.valeur === valeur) || REGIMES[0]
}

export function libelleRegime(valeur) {
  return trouverRegime(valeur).libelle
}

// Pourquoi le plat ne convient pas au régime (« Contient du porc »), ou null s'il convient
export function raisonRegime(regime, contenu = [], allergenes = []) {
  if (regime === 'vegetarien' && contenu.includes('porc')) return 'Contient du porc'
  if (regime === 'vegetarien' && contenu.includes('viande')) return 'Contient de la viande'
  if (regime === 'vegetarien' && allergenes.includes('poisson')) return 'Contient du poisson'
  if ((regime === 'sans_porc' || regime === 'halal') && contenu.includes('porc')) return 'Contient du porc'
  if (regime === 'halal' && contenu.includes('non_halal')) return 'Viande non halal'
  return null
}

// Raison pour le plat du jour d'un menu, selon le profil (régime proposé, ou mots du régime écrit à la main)
export function raisonRegimeDuMenu(menu, profil) {
  const regime = profil.regime || 'aucun'
  if (regimeEstPersonnel(regime)) return soupconRegimePersonnel(regime, menu)
  return raisonRegime(regime, menu.contenu || [], menu.allergenes || [])
}

// Petits mots qui ne disent rien du plat (« sans », « pas de »…)
const MOTS_VIDES = new Set(['sans', 'avec', 'aucun', 'aucune', 'regime', 'mange', 'manger', 'jamais', 'plus', 'tout', 'tous', 'rien', 'que', 'des', 'les', 'pas'])

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').toLowerCase()
}

function motsSignificatifs(texte) {
  return sansAccents(texte || '')
    .split(/[^a-z]+/)
    .filter((mot) => mot.length >= LONGUEUR_MINI_MOT && !MOTS_VIDES.has(mot))
    .map((mot) => mot.replace(/s$/, ''))
}

// Tout ce qu'on sait du plat, en minuscules sans accents : noms de l'entrée, du plat, du dessert et ce qu'il contient
function texteDuPlat(menu) {
  const contenu = (menu.contenu || []).map((valeur) => (valeur === 'non_halal' ? 'non halal' : valeur)).join(' ')
  return sansAccents(`${menu.entree || ''} ${menu.plat} ${menu.dessert || ''} ${contenu}`)
}

// Les allergies écrites à la main, une par entrée : « kiwi, crevettes » → ['kiwi', 'crevettes']
export function listerAutresAllergies(texte) {
  return (texte || '')
    .split(',')
    .map((morceau) => morceau.trim())
    .filter(Boolean)
}

// La première allergie écrite à la main qui apparaît dans le plat (« crevettes »), ou null
export function soupconAutreAllergie(autreAllergie, menu) {
  const textePlat = texteDuPlat(menu)
  return listerAutresAllergies(autreAllergie).find((allergie) => motsSignificatifs(allergie).some((mot) => textePlat.includes(mot))) || null
}

// Régime écrit à la main dont un mot apparaît dans le plat (« Pas de bœuf » et « Riz sauce bœuf ») : « À vérifier pour ton régime », sinon null
export function soupconRegimePersonnel(regime, menu) {
  const textePlat = texteDuPlat(menu)
  return motsSignificatifs(regime).some((mot) => textePlat.includes(mot)) ? 'À vérifier pour ton régime' : null
}
