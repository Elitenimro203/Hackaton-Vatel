// Liste des 5 allergènes suivis par la cantine, avec le nom de leur icône (composants/Icone.jsx), et comparaison avec les allergies d'un profil.
import { libelleRegime, listerAutresAllergies, raisonRegime, raisonRegimeDuMenu, soupconAutreAllergie } from './regimes'

export const ALLERGENES = [
  { valeur: 'arachide', icone: 'arachide', libelle: 'Arachide', article: 'de l’arachide' },
  { valeur: 'lait', icone: 'lait', libelle: 'Lait', article: 'du lait' },
  { valeur: 'gluten', icone: 'gluten', libelle: 'Gluten', article: 'du gluten' },
  { valeur: 'poisson', icone: 'poisson', libelle: 'Poisson', article: 'du poisson' },
  { valeur: 'oeuf', icone: 'oeuf', libelle: 'Œuf', article: 'de l’œuf' },
]

// Ce qu'on peut taper pour chacun des 5 allergènes suivis (sans accents, au singulier)
const SYNONYMES = {
  arachide: ['arachide', 'cacahuete', 'cacahouete', 'pate d arachide'],
  lait: ['lait', 'lactose', 'produit laitier', 'laitage'],
  gluten: ['gluten', 'ble', 'farine de ble'],
  poisson: ['poisson'],
  oeuf: ['oeuf'],
}

// « Cacahuètes » → 'arachide' ; null si ce n'est pas un des 5 allergènes suivis (c'est alors une allergie libre)
export function reconnaitreAllergene(texte) {
  const propre = (texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/(s|x)$/, '')
  const trouve = Object.entries(SYNONYMES).find(([, mots]) => mots.includes(propre))
  return trouve ? trouve[0] : null
}

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
  if (risques.length > 0) return decrireAllergenes(risques)
  const raison = raisonRegimeDuMenu(menu, profil)
  if (raison) return raison
  const soupcon = soupconAutreAllergie(profil.autre_allergie, menu)
  return soupcon ? `Peut contenir : ${soupcon}` : null
}

// « Arachide · Kiwi · Végétarien », ou null si rien n'est déclaré
export function resumerProfil(profil) {
  const morceaux = (profil.allergies || []).map((valeur) => trouverAllergene(valeur).libelle)
  listerAutresAllergies(profil.autre_allergie).forEach((allergie) => morceaux.push(allergie.charAt(0).toUpperCase() + allergie.slice(1)))
  if (profil.regime && profil.regime !== 'aucun') morceaux.push(libelleRegime(profil.regime))
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
