// Carte « Portion et gaspillage » : pour chaque plat, la part d'avis « portion trop grande » croisée avec le taux de repas non consommés.
import { phrasePortion } from '../lib/statsInsights'
import { formaterPourcent } from '../lib/formatage'

export default function PortionGaspillage({ plats }) {
  return (
    <section className="carte pilotage-carte" aria-labelledby="titre-portion">
      <h2 id="titre-portion" className="titre-pilotage">Portion et gaspillage</h2>
      <p className="aide portion-phrase">{phrasePortion(plats)}</p>

      {plats.length === 0 ? (
        <p className="mention">Pas encore assez d’avis par plat (5 au moins).</p>
      ) : (
        <ul className="portion-liste">
          {plats.map((plat) => (
            <li key={plat.plat} className="portion-ligne">
              <span className="portion-plat">{plat.plat}</span>
              <span className="portion-valeur">{plat.part_pct} %</span>
              <progress
                className="barre-piment portion-barre"
                value={plat.part_pct}
                max="100"
                aria-label={`${plat.part_pct} % des avis de ${plat.plat} disent que la portion est trop grande`}
              />
              <span className="mention portion-detail">
                {plat.trop_grande} avis sur {plat.avis} · repas non consommés : {plat.taux_non_servis === null ? 'pas de service passé' : formaterPourcent(plat.taux_non_servis)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
