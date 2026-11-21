// Liste des 5 allergènes suivis par la cantine, avec leur emoji, et comparaison avec les allergies d'un profil.
export const ALLERGENES = [
  { valeur: 'arachide', emoji: '🥜', libelle: 'Arachide', article: 'de l’arachide' },
  { valeur: 'lait', emoji: '🥛', libelle: 'Lait', article: 'du lait' },
  { valeur: 'gluten', emoji: '🌾', libelle: 'Gluten', article: 'du gluten' },
  { valeur: 'poisson', emoji: '🐟', libelle: 'Poisson', article: 'du poisson' },
  { valeur: 'oeuf', emoji: '🥚', libelle: 'Œuf', article: 'de l’œuf' },
]

export function trouverAllergene(valeur) {
  return ALLERGENES.find((allergene) => allergene.valeur === valeur) || { valeur, emoji: '⚠', libelle: valeur, article: valeur }
}

// Allergènes du plat qui sont aussi dans les allergies du profil
export function allergenesARisque(allergenesDuPlat = [], allergiesDuProfil = []) {
  return allergenesDuPlat.filter((valeur) => allergiesDuProfil.includes(valeur))
}

// « 🥜 Arachide · 🥛 Lait »
export function decrireAllergenes(valeurs) {
  return valeurs.map((valeur) => {
    const allergene = trouverAllergene(valeur)
    return `${allergene.emoji} ${allergene.libelle}`
  }).join(' · ')
}

// « de l’arachide et du lait » (pour « Ce plat contient … »)
export function nommerAllergenes(valeurs) {
  return valeurs.map((valeur) => trouverAllergene(valeur).article).join(' et ')
}

// « arachide ni lait » (pour « Sans … »)
export function listerSansAllergenes(valeurs) {
  return valeurs.map((valeur) => trouverAllergene(valeur).libelle.toLowerCase()).join(' ni ')
}

// Le plat de remplacement du menu, s'il existe et ne contient aucune allergie du profil
export function alternativeCompatible(menu, allergiesDuProfil = []) {
  if (!menu.plat_alternatif) return false
  return allergenesARisque(menu.allergenes_alternatif, allergiesDuProfil).length === 0
}
