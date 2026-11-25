// Régimes alimentaires du profil et ce que contient un plat : dit si un plat convient (même règle que conflit_regime en SQL).

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

export function trouverRegime(valeur) {
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

// Raison pour le plat du jour d'un menu, selon le profil
export function raisonRegimeDuMenu(menu, profil) {
  return raisonRegime(profil.regime || 'aucun', menu.contenu || [], menu.allergenes || [])
}

function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// L'allergie tapée à la main (« crevettes, kiwi ») apparaît-elle dans le nom du plat, de l'entrée ou du dessert ?
export function soupconAutreAllergie(autreAllergie, menu) {
  const mots = sansAccents(autreAllergie || '')
    .split(/[^a-z]+/)
    .filter((mot) => mot.length >= LONGUEUR_MINI_MOT)
    .map((mot) => mot.replace(/s$/, ''))
  if (mots.length === 0) return false
  const textePlat = sansAccents(`${menu.entree || ''} ${menu.plat} ${menu.dessert || ''}`)
  return mots.some((mot) => textePlat.includes(mot))
}
