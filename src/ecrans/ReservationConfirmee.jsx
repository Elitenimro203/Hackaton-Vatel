// Écran « C'est réservé » : coche verte, pluie de grains, ticket crème avec le code de retrait, puis direction Mes repas.
import { useEffect, useState } from 'react'
import { chargerMesReservations } from '../lib/reservations'
import { formaterMontant } from '../lib/formatage'
import TicketRetrait from '../composants/TicketRetrait'
import Icone from '../composants/Icone'
import '../reservation.css'

const NOMBRE_GRAINS = 14

export default function ReservationConfirmee({ menu, profil, onVoirMesRepas }) {
  const [reservation, setReservation] = useState(null)
  const [erreur, setErreur] = useState(null)
  const prenom = profil.nom.trim().split(' ')[0] || 'toi'

  useEffect(() => {
    async function chargerTicket() {
      const resultat = await chargerMesReservations(profil.id, [menu.id])
      setReservation(resultat.reservations[0] || null)
      setErreur(resultat.erreur)
    }
    chargerTicket()
  }, [menu.id, profil.id])

  return (
    <section className="pile confirmation">
      <div className="confirmation-photo">
        {menu.photo_url && <img src={menu.photo_url} alt={menu.plat} />}
        <div className="grains" aria-hidden="true">
          {Array.from({ length: NOMBRE_GRAINS }, (_, position) => (
            <span key={position} className="grain" />
          ))}
        </div>
        <div className="rond-coche" aria-hidden="true">
          <svg className="coche" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <div className="centre pile">
        <span className="surtitre">C’est réservé, {prenom}&nbsp;!</span>
        <h1>Ta pause a du goût.</h1>
      </div>

      {!reservation && !erreur && <div className="squelette squelette-ticket" aria-label="Chargement du ticket…" />}

      {erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="recu" />
          <div>
            <strong>Ticket introuvable pour l’instant</strong>
            <p>Ta réservation est faite : retrouve ton code dans Mes repas.</p>
          </div>
        </div>
      )}

      {reservation && (
        <TicketRetrait plat={menu.plat} jour={menu.jour} code={reservation.code_retrait} creneau={reservation.creneau} />
      )}

      <p className="aide centre">
        Présente ce numéro à la cantine.
        <br />
        On garde ton assiette au chaud.
      </p>
      <p className="mention centre">Il te reste {formaterMontant(profil.solde)} sur ton compte.</p>

      <button type="button" className="btn btn-centre" onClick={onVoirMesRepas}>
        Voir mes repas
      </button>
    </section>
  )
}
