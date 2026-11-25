// Liste des 5 allergènes suivis par la cantine, avec le nom de leur icône (composants/Icone.jsx), et comparaison avec les allergies d'un profil.
import { libelleRegime, raisonRegime, raisonRegimeDuMenu } from './regimes'

export const ALLERGENES = [
  { valeur: 'arachide', icone: 'arachide', libelle: 'Arachide', article: 'de l’arachide' },
  { valeur: 'lait', icone: 'lait', libelle: 'Lait', article: 'du lait' },
  { valeur: 'gluten', icone: 'gluten', libelle: 'Gluten', article: 'du gluten' },
  { valeur: 'poisson', icone: 'poisson', libelle: 'Poisson', article: 'du poisson' },
  { valeur: 'oeuf', icone: 'oeuf', libelle: 'Œuf', article: 'de l’œuf' },
]

export function trouverAllergene(valeur) {
  return ALLERGENES.find((allergene) => allergene.valeur === valeur) || { valeur, icone: 'alerte', libelle: valeur, article: valeur }
}

// Allergènes du plat qui sont aussi dans les allergies du profil
export function allergenesARisque(allergenesDuPlat = [], allergiesDuProfil = []) {
  return allergenesDuPlat.filter((valeur) => allergiesDuProfil.includes(valeur))
}

// « Arachide · Lait »
export function decrireAllergenes(valeurs) {
  return valeurs.map((valeur) => trouverAllergene(valeur).libelle).join(' · ')
}

// « de l’arachide et du lait » (pour « Ce plat contient … »)
export function nommerAllergenes(valeurs) {
  return valeurs.map((valeur) => trouverAllergene(valeur).article).join(' et ')
}

// « arachide ni lait » (pour « Sans … »)
export function listerSansAllergenes(valeurs) {
  return valeurs.map((valeur) => trouverAllergene(valeur).libelle.toLowerCase()).join(' ni ')
}

// Le plat de remplacement du menu, s'il existe, sans allergie du profil et compatible avec son régime
export function alternativeCompatible(menu, allergiesDuProfil = [], regime = 'aucun') {
  if (!menu.plat_alternatif) return false
  if (allergenesARisque(menu.allergenes_alternatif, allergiesDuProfil).length > 0) return false
  return raisonRegime(regime, menu.contenu_alternatif || [], menu.allergenes_alternatif || []) === null
}

// Ce qui ne va pas au profil (« Arachide », « Contient du porc »), ou null si le plat lui convient
export function problemeDuPlat(menu, profil) {
  const risques = allergenesARisque(menu.allergenes, profil.allergies || [])
  return risques.length > 0 ? decrireAllergenes(risques) : raisonRegimeDuMenu(menu, profil)
}

// « Arachide · Végétarien · Autre : kiwi », ou null si rien n'est déclaré
export function resumerProfil(profil) {
  const morceaux = []
  if ((profil.allergies || []).length > 0) morceaux.push(decrireAllergenes(profil.allergies))
  if (profil.regime && profil.regime !== 'aucun') morceaux.push(libelleRegime(profil.regime))
  if (profil.autre_allergie) morceaux.push(`Autre : ${profil.autre_allergie}`)
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
