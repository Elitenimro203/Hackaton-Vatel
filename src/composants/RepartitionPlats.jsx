// Répartition des repas du jour par plat : miniature, nom du plat, nombre de portions et barre piment.
import PhotoPlat from './PhotoPlat'

function libelleReste(reste, termine) {
  if (!termine) return `${reste} à servir`
  return `${reste} pas retirée${reste > 1 ? 's' : ''}`
}

// termine : le service est fini, les portions restantes sont « pas retirées »
export default function RepartitionPlats({ plats, total, termine = false }) {
  return (
    <section className="repartition" aria-label="Répartition par plat">
      {plats.map((plat) => (
        <article key={plat.plat} className="carte carte-plat-jour">
          <PhotoPlat adresse={plat.photo} nomPlat={plat.plat} />
          <div className="carte-plat-texte">
            <h3 className="nom-plat">{plat.plat}</h3>
            <strong className="portions">
              {plat.portions} portion{plat.portions > 1 ? 's' : ''}
            </strong>
            <progress className="barre-piment" value={plat.portions} max={total}>
              {plat.portions} sur {total}
            </progress>
            <span className="mention">
              {plat.servies} servie{plat.servies > 1 ? 's' : ''} · {libelleReste(plat.portions - plat.servies, termine)}
            </span>
          </div>
        </article>
      ))}
    </section>
  )
}
