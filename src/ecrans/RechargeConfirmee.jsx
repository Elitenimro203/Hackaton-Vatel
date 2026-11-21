// Écran de succès vert après une recharge : coche qui se dessine, montant ajouté, nouveau solde, bouton retour.
import { formaterMontant } from '../lib/formatage'
import '../reservation.css'
import '../recharge.css'

export default function RechargeConfirmee({ recharge, pourParent, libelleRetour, onRetour }) {
  return (
    <section className="pile recharge-reussie">
      <div className="rond-succes" aria-hidden="true">
        <svg className="coche" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="centre bloc-succes">
        <span className="surtitre texte-feuille">Recharge réussie</span>
        <p className="montant-succes">+{formaterMontant(recharge.montant)}</p>
        <h1>{pourParent ? `${recharge.prenom} peut manger tranquille.` : 'Ton assiette t’attend.'}</h1>
      </div>

      <ul className="carte liste-repas">
        <li className="carte-ligne">
          <span className="mention">Nouveau solde</span>
          <span className="prix texte-feuille">
            {recharge.nouveauSolde === null ? 'Mis à jour' : formaterMontant(recharge.nouveauSolde)}
          </span>
        </li>
        <li className="carte-ligne">
          <span className="mention">Payé avec</span>
          <span className="prix">{recharge.operateur}</span>
        </li>
        <li className="carte-ligne">
          <span className="mention">Numéro</span>
          <span className="prix">{recharge.numero}</span>
        </li>
      </ul>

      <button type="button" className="btn btn-centre" onClick={onRetour}>
        {libelleRetour}
      </button>
      <p className="mention centre">Simulation de paiement · Aucun débit réel</p>
    </section>
  )
}
