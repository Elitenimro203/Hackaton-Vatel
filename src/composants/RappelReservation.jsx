// Rappel en haut de « À table » : il reste peu de temps pour réserver, ou le jour de demain est raté (réservations fermées à 18 h).
import { formaterDate } from '../lib/formatage'
import { formaterTempsRestant } from '../lib/rappels'
import Icone from './Icone'

export default function RappelReservation({ jourUrgent, minutesRestantes, jourManque, onVoirMenu }) {
  if (jourUrgent) {
    return (
      <div className="alerte alerte-attention rappel" role="status">
        <Icone nom="horloge" className="icone-safran" />
        <div>
          <strong>Plus que {formaterTempsRestant(minutesRestantes)} pour réserver</strong>
          <p>Ton repas de {formaterDate(jourUrgent)} se réserve avant 18 h. Après, la cuisine lance ses commandes.</p>
        </div>
      </div>
    )
  }

  if (jourManque) {
    return (
      <div className="alerte alerte-info rappel" role="status">
        <Icone nom="calendrier-barre" />
        <div>
          <strong>Pas de repas réservé {formaterDate(jourManque)}</strong>
          <p>Les réservations ont fermé à 18 h la veille. Pour ne plus rater un jour, réserve toute ta semaine d’un coup.</p>
          <button type="button" className="btn-lien" onClick={onVoirMenu}>
            Réserver ma semaine
          </button>
        </div>
      </div>
    )
  }

  return null
}
