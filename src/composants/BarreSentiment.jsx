// Barre de sentiment empilée : positif en feuille, neutre en gris chaud, négatif en piment. Dessinée en SVG (largeurs en attributs, pas de style en ligne).
export default function BarreSentiment({ positif, neutre, negatif }) {
  const total = positif + neutre + negatif
  const part = (valeur) => (total > 0 ? (valeur * 100) / total : 0)
  const largeurPositif = part(positif)
  const largeurNeutre = part(neutre)
  const largeurNegatif = part(negatif)
  const description = `${Math.round(largeurPositif)} % positifs, ${Math.round(largeurNeutre)} % neutres, ${Math.round(largeurNegatif)} % négatifs`

  return (
    <svg className="barre-sentiment" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={description}>
      <rect className="sentiment-positif" x="0" y="0" width={largeurPositif} height="10" />
      <rect className="sentiment-neutre" x={largeurPositif} y="0" width={largeurNeutre} height="10" />
      <rect className="sentiment-negatif" x={largeurPositif + largeurNeutre} y="0" width={largeurNegatif} height="10" />
    </svg>
  )
}
