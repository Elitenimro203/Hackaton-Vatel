// Ticket crème à bords dentelés : le plat, le QR à montrer au comptoir, le jour, l'heure de passage (ou du service) et le code de secours « CJ · 0812 ».
import QrTicket from './QrTicket'
import { formaterCodeRetrait, formaterCreneau, formaterDateCourte, HORAIRE_SERVICE } from '../lib/formatage'

export default function TicketRetrait({ plat, jour, code, creneau = null }) {
  return (
    <article className="ticket ticket-gauche" aria-label={`Ticket de retrait ${formaterCodeRetrait(code)}`}>
      <span className="ticket-libelle">Ton petit bonheur de midi</span>
      <h2 className="ticket-plat">{plat}</h2>
      <div className="ticket-separation" />
      <QrTicket code={code} jour={jour} />
      <p className="ticket-secours">Pas de réseau ou écran cassé ? Donne ton code au comptoir.</p>
      <div className="ticket-separation" />
      <div className="ticket-colonnes">
        <div>
          <span className="ticket-libelle">{formaterDateCourte(jour)}</span>
          <strong className="ticket-valeur">{creneau ? `Passe à ${formaterCreneau(creneau)}` : HORAIRE_SERVICE}</strong>
        </div>
        <div className="ticket-droite">
          <span className="ticket-libelle">Retrait</span>
          <strong className="ticket-valeur">{formaterCodeRetrait(code)}</strong>
        </div>
      </div>
    </article>
  )
}
