// Répartition des repas du jour par plat : miniature, nom du plat, nombre de portions et barre piment.
import PhotoPlat from './PhotoPlat'

export default function RepartitionPlats({ plats, total }) {
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
              {plat.servies} servie{plat.servies > 1 ? 's' : ''} · {plat.portions - plat.servies} à servir
            </span>
          </div>
        </article>
      ))}
    </section>
  )
}
