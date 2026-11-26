// Lecture et écriture de fichiers CSV sans bibliothèque : séparateur ; ou , détecté sur la première ligne, guillemets gérés, BOM UTF-8 pour Excel.

const BOM = '﻿'
const MAX_LIGNES = 5000

// « ; » ou « , » : le plus fréquent hors guillemets sur la première ligne (point-virgule par défaut, comme Excel en français)
function detecterSeparateur(texte) {
  const premiereLigne = texte.split(/\r?\n/, 1)[0]
  let virgules = 0
  let pointsVirgules = 0
  let dansGuillemets = false
  for (const caractere of premiereLigne) {
    if (caractere === '"') dansGuillemets = !dansGuillemets
    else if (!dansGuillemets && caractere === ',') virgules += 1
    else if (!dansGuillemets && caractere === ';') pointsVirgules += 1
  }
  return virgules > pointsVirgules ? ',' : ';'
}

// Texte CSV → tableau de lignes (tableaux de cellules). Gère "a ""b""" et les retours à la ligne dans les guillemets.
export function lireCsv(texteBrut) {
  const texte = texteBrut.replace(/^\uFEFF/, '')
  const separateur = detecterSeparateur(texte)
  const lignes = []
  let ligne = []
  let cellule = ''
  let dansGuillemets = false

  for (let i = 0; i < texte.length; i += 1) {
    const caractere = texte[i]
    if (dansGuillemets) {
      if (caractere === '"' && texte[i + 1] === '"') {
        cellule += '"'
        i += 1
      } else if (caractere === '"') {
        dansGuillemets = false
      } else {
        cellule += caractere
      }
    } else if (caractere === '"') {
      dansGuillemets = true
    } else if (caractere === separateur) {
      ligne.push(cellule)
      cellule = ''
    } else if (caractere === '\n' || caractere === '\r') {
      if (caractere === '\r' && texte[i + 1] === '\n') i += 1
      ligne.push(cellule)
      cellule = ''
      lignes.push(ligne)
      ligne = []
    } else {
      cellule += caractere
    }
  }
  if (cellule !== '' || ligne.length > 0) {
    ligne.push(cellule)
    lignes.push(ligne)
  }
  const nonVides = lignes.filter((cellules) => cellules.some((valeur) => valeur.trim() !== ''))
  return { lignes: nonVides.slice(0, MAX_LIGNES + 1), separateur, tronque: nonVides.length > MAX_LIGNES + 1 }
}

// Une cellule : texte entre guillemets si besoin ; un nombre prend la virgule décimale française ; un texte qui commence par = + - @
// est précédé d'une apostrophe pour qu'Excel ne l'exécute jamais comme une formule.
function ecrireCellule(valeur) {
  if (valeur === null || valeur === undefined) return ''
  if (typeof valeur === 'number') return String(valeur).replace('.', ',')
  let texte = String(valeur)
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

// colonnes = [{ titre, cle }], lignes = [objets] → texte CSV avec BOM, séparateur ; et fin de ligne Windows
export function ecrireCsv(colonnes, lignes) {
  const entete = colonnes.map((colonne) => ecrireCellule(colonne.titre)).join(';')
  const corps = lignes.map((ligne) => colonnes.map((colonne) => ecrireCellule(ligne[colonne.cle])).join(';'))
  return `${BOM}${[entete, ...corps].join('\r\n')}\r\n`
}

// Lance le téléchargement d'un fichier texte dans le navigateur
export function telechargerCsv(nomFichier, contenu) {
  const lien = document.createElement('a')
  const adresse = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
  lien.href = adresse
  lien.download = nomFichier
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(adresse), 1000)
}
