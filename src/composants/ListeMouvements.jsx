// Historique du solde dans une carte : motif, date et heure, montant en vert (recharge) ou crème (repas).
import { formaterDateHeure, formaterMontant } from '../lib/formatage'
import '../reservation.css'

export default function ListeMouvements({ mouvements, unite = 'F' }) {
  return (
    <ul className="carte liste-repas">
      {mouvements.map((mouvement) => (
        <li key={mouvement.id} className="carte-ligne">
          <div>
            <p className="mouvement-motif">{mouvement.motif}</p>
            <p className="mention">{formaterDateHeure(mouvement.cree_le)}</p>
          </div>
          <span className={mouvement.montant > 0 ? 'prix texte-feuille' : 'prix'}>
            {mouvement.montant > 0 ? '+' : ''}
            {formaterMontant(mouvement.montant, unite)}
          </span>
        </li>
      ))}
    </ul>
  )
}
