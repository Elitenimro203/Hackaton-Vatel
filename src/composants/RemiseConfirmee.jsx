// Confirmation au comptoir : grande coche verte, « Bon appétit, Awa ! », plat remis et compteur du jour ; retour au clavier tout seul après 4 secondes.
import { useEffect } from 'react'
import { formaterCodeRetrait, formaterHeure, prenomAffiche } from '../lib/formatage'

const RETOUR_AUTOMATIQUE = 4000

export default function RemiseConfirmee({ ticket, servis, total, onSuivant }) {
  useEffect(() => {
    const minuteur = setTimeout(onSuivant, RETOUR_AUTOMATIQUE)
    return () => clearTimeout(minuteur)
  }, [onSuivant])

  return (
    <section className="pile remise-confirmee" role="status">
      <div className="remise-coche">
        <svg className="coche" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="badge badge-succes">Servi à {formaterHeure(new Date())}</span>
      <h1 className="admin-titre">Bon appétit, {prenomAffiche(ticket.nom)}&nbsp;!</h1>
      <p className="aide">Le repas est remis. Le ticket {formaterCodeRetrait(ticket.code_retrait)} ne peut plus servir.</p>

      <dl className="carte remise-resume">
        <div className="espace-entre">
          <dt className="mention">Plat remis</dt>
          <dd className="nom-plat">{ticket.plat}</dd>
        </div>
        <div className="espace-entre">
          <dt className="mention">Repas remis aujourd’hui</dt>
          <dd className="prix texte-safran">
            {servis} / {total}
          </dd>
        </div>
      </dl>

      <button type="button" className="btn" onClick={onSuivant}>
        Code suivant
      </button>
    </section>
  )
}
