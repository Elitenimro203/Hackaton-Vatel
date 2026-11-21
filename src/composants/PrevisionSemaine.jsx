// Carte « La semaine prochaine » : pour chaque jour ouvré, repas prévus et quantité conseillée à préparer (calculés en SQL).
import { formaterJourCourt, formaterNombre, formaterNumeroJour, formaterPlageSemaine } from '../lib/formatage'

export default function PrevisionSemaine({ jours }) {
  const plusGrand = Math.max(1, ...jours.map((jour) => jour.conseille))

  return (
    <section className="carte pilotage-carte" aria-labelledby="titre-prevision">
      <h2 id="titre-prevision" className="titre-pilotage">La semaine prochaine</h2>
      {jours.length > 0 && (
        <span className="surtitre">{formaterPlageSemaine(jours[0].jour)} · portions conseillées</span>
      )}

      <ul className="prevision-liste">
        {jours.map((jour) => (
          <li key={jour.jour} className="prevision-ligne">
            <span className="prevision-jour">
              {formaterJourCourt(jour.jour)} {formaterNumeroJour(jour.jour)}
            </span>
            <progress className="barre-safran" value={jour.conseille} max={plusGrand}>
              {jour.conseille}
            </progress>
            <strong className="prevision-valeur">{formaterNombre(jour.conseille)}</strong>
            <span className="prevision-detail mention">
              {formaterNombre(jour.prevision)} prévus · {formaterNombre(jour.reserves)} déjà réservés
            </span>
          </li>
        ))}
      </ul>

      <p className="mention">
        Prévision = le plus grand entre les réservations déjà faites et la moyenne des 4 derniers mêmes jours.
        On conseille d’en préparer 5 % de plus, pour ne jamais manquer.
      </p>
    </section>
  )
}
