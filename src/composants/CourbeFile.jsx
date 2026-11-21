// Graphique SVG fait main : personnes dans la file minute par minute, courbe « avant » (gris chaud, pointillée) et « avec CantiJuste » (safran).

const LARGEUR = 600
const HAUTEUR = 260
const MARGE = { haut: 16, bas: 36, gauche: 8, droite: 8 }
const MINUTES_AFFICHEES = 100
const REPERES = [
  { minute: 10, libelle: '12 h' },
  { minute: 40, libelle: '12 h 30' },
  { minute: 70, libelle: '13 h' },
  { minute: 100, libelle: '13 h 30' },
]

// Transforme une liste « file à chaque minute » en points « x,y » du graphique
function versPoints(courbe, plafond) {
  const largeurUtile = LARGEUR - MARGE.gauche - MARGE.droite
  const hauteurUtile = HAUTEUR - MARGE.haut - MARGE.bas
  return [0, ...courbe.slice(0, MINUTES_AFFICHEES)].map((valeur, minute) => {
    const x = MARGE.gauche + (minute / MINUTES_AFFICHEES) * largeurUtile
    const y = MARGE.haut + hauteurUtile * (1 - Math.min(valeur, plafond) / plafond)
    return [x.toFixed(1), y.toFixed(1)]
  })
}

export default function CourbeFile({ avant, apres }) {
  const plafond = Math.max(10, Math.ceil(Math.max(...avant, ...apres) / 10) * 10)
  const pointsAvant = versPoints(avant, plafond)
  const pointsApres = versPoints(apres, plafond)
  const ligne = (points) => points.map(([x, y], position) => `${position === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const bas = HAUTEUR - MARGE.bas
  const aireApres = `${ligne(pointsApres)} L${pointsApres[pointsApres.length - 1][0]} ${bas} L${pointsApres[0][0]} ${bas} Z`
  const graduations = [0, 0.5, 1]

  return (
    <svg
      className="courbe-file"
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      role="img"
      aria-label={`Personnes dans la file, minute par minute, de 11 h 50 à 13 h 30 : jusqu'à ${Math.round(Math.max(...avant))} avant, ${Math.round(Math.max(...apres))} avec CantiJuste`}
    >
      <defs>
        <linearGradient id="degrade-courbe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="degrade-haut" />
          <stop offset="100%" className="degrade-bas" />
        </linearGradient>
      </defs>

      {graduations.map((part) => {
        const y = MARGE.haut + (HAUTEUR - MARGE.haut - MARGE.bas) * (1 - part)
        return (
          <g key={part}>
            <line className="courbe-grille" x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={y} y2={y} />
            <text className="courbe-texte" x={MARGE.gauche + 4} y={y - 6}>
              {Math.round(plafond * part)}
            </text>
          </g>
        )
      })}

      <path className="courbe-aire" d={aireApres} fill="url(#degrade-courbe)" />
      <path className="courbe-avant" d={ligne(pointsAvant)} />
      <path className="courbe-apres" d={ligne(pointsApres)} />

      {REPERES.map((repere) => {
        const x = MARGE.gauche + (repere.minute / MINUTES_AFFICHEES) * (LARGEUR - MARGE.gauche - MARGE.droite)
        return (
          <text key={repere.minute} className="courbe-texte courbe-heure" x={x} y={HAUTEUR - 10}>
            {repere.libelle}
          </text>
        )
      })}
    </svg>
  )
}
