// Carte de remise du comptoir : qui, quel plat, payé, et en rouge l'allergie à vérifier ; un seul bouton pour remettre le repas.
import { decrireAllergenes, nommerAllergenes } from '../lib/allergenes'
import { libelleRegime } from '../lib/regimes'
import { formaterCodeRetrait, formaterCreneau, formaterMontant, initiales, libelleDuProfil, prenomAffiche } from '../lib/formatage'
import PhotoPlat from './PhotoPlat'
import Icone from './Icone'

export default function CarteRemise({ ticket, enCours, onRemettre, onAnnuler }) {
  const prenom = prenomAffiche(ticket.nom)
  const risques = ticket.risques || []
  const autresAllergies = (ticket.allergies || []).filter((allergie) => !risques.includes(allergie))
  const aRegime = ticket.regime && ticket.regime !== 'aucun'
  const aVerifier = risques.length > 0

  return (
    <section className="pile remise">
      <div className="espace-entre">
        <span className="surtitre">Code {formaterCodeRetrait(ticket.code_retrait)}</span>
        <span className="badge badge-info">{ticket.creneau ? `Réservé · ${formaterCreneau(ticket.creneau)}` : 'Réservé'}</span>
      </div>

      <article className="carte pile">
        <div className="remise-convive">
          <span className="remise-avatar" aria-hidden="true">{initiales(ticket.nom)}</span>
          <div>
            <strong className="remise-nom">{ticket.nom}</strong>
            <span className="mention">{libelleDuProfil({ role: 'eleve', type_usager: ticket.type_usager })}</span>
          </div>
        </div>

        <PhotoPlat adresse={ticket.photo_url} nomPlat={ticket.plat}>
          {risques.length > 0 && (
            <div className="allergenes remise-risques">
              {risques.map((risque) => (
                <span key={risque} className="allergene allergene-danger">{decrireAllergenes([risque])}</span>
              ))}
            </div>
          )}
        </PhotoPlat>
        <h1 className="nom-plat remise-plat">{ticket.plat}</h1>
        <div className="espace-entre remise-paye">
          <span className="mention">Payé à la réservation</span>
          <strong className="prix texte-safran">{formaterMontant(ticket.montant)}</strong>
        </div>
      </article>

      {aVerifier && (
        <div className="alerte alerte-erreur remise-alerte" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Allergie : le plat contient {nommerAllergenes(risques)}</strong>
            <p>
              {prenom} a réservé quand même, ses parents sont prévenus.
              {ticket.plat_remplacement ? ` Propose le plat de remplacement : ${ticket.plat_remplacement}.` : ''}
            </p>
          </div>
        </div>
      )}

      {(autresAllergies.length > 0 || aRegime || ticket.autre_allergie) && (
        <div className="alerte alerte-attention">
          <Icone nom="bouclier" className="icone-safran" />
          <div>
            <strong>À savoir avant de servir</strong>
            <p>
              {[
                autresAllergies.length > 0 && `Allergies : ${decrireAllergenes(autresAllergies)}`,
                ticket.autre_allergie && `Autre allergie : ${ticket.autre_allergie}`,
                aRegime && `Régime : ${libelleRegime(ticket.regime)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      <button type="button" className="btn" onClick={onRemettre} disabled={enCours}>
        {enCours ? 'Remise…' : aVerifier ? 'J’ai vérifié, remettre' : 'Remettre le repas'}
      </button>
      <button type="button" className="btn btn-discret" onClick={onAnnuler} disabled={enCours}>
        Ce n’est pas le bon code
      </button>
    </section>
  )
}
