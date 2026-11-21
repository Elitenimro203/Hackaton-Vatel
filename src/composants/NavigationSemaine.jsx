// Sélecteur de semaine : flèche précédente, « 23 – 27 novembre », flèche suivante.
import { ajouterJours, formaterPlageSemaine } from '../lib/formatage'

export default function NavigationSemaine({ lundi, onChanger, classeTitre = '' }) {
  return (
    <div className="navigation-semaine">
      <button type="button" className="btn-icone" onClick={() => onChanger(ajouterJours(lundi, -7))} aria-label="Semaine précédente">
        ‹
      </button>
      <span className={`navigation-semaine-titre ${classeTitre}`}>{formaterPlageSemaine(lundi)}</span>
      <button type="button" className="btn-icone" onClick={() => onChanger(ajouterJours(lundi, 7))} aria-label="Semaine suivante">
        ›
      </button>
    </div>
  )
}
