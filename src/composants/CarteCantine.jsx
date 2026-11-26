// Carte cantine virtuelle : identité du convive, tarif, solde, allergies et code de retrait du jour, lisibles d'un seul regard au comptoir.
import { useCallback, useEffect, useState } from 'react'
import { trouverAllergene } from '../lib/allergenes'
import { libelleRegime } from '../lib/regimes'
import { soldeEstBas } from '../lib/recharges'
import { PRIX_ELEVE_PAR_DEFAUT, PRIX_EMPLOYE_PAR_DEFAUT } from '../lib/menus'
import { chargerTicketDuJour } from '../lib/reservations'
import { useTempsReel } from '../lib/useTempsReel'
import { formaterCodeRetrait, formaterCreneau, formaterMontant, HORAIRE_SERVICE } from '../lib/formatage'
import Icone from './Icone'

// « CJ 4F2A · 9C31 » : numéro de carte stable, tiré de l'identifiant du compte
function numeroDeCarte(idCompte) {
  const chiffres = idCompte.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `CJ ${chiffres.slice(0, 4)} · ${chiffres.slice(4, 8)}`
}

export default function CarteCantine({ profil }) {
  const [ticketDuJour, setTicketDuJour] = useState(null)

  const chargerTicket = useCallback(async () => {
    setTicketDuJour(await chargerTicketDuJour(profil.id))
  }, [profil.id])

  useEffect(() => {
    chargerTicket()
  }, [chargerTicket])

  // Un repas réservé ou servi aujourd'hui : la carte change toute seule
  useTempsReel('reservations', chargerTicket, `eleve_id=eq.${profil.id}`)

  const estEmploye = profil.type_usager === 'employe'
  const prixRepas = estEmploye ? PRIX_EMPLOYE_PAR_DEFAUT : PRIX_ELEVE_PAR_DEFAUT
  const soldeBas = soldeEstBas(profil.solde)
  const allergies = (profil.allergies || []).map(trouverAllergene).filter(Boolean)
  const regime = profil.regime && profil.regime !== 'aucun' ? libelleRegime(profil.regime) : null
  const aSurveiller = allergies.length > 0 || regime || profil.autre_allergie
  const anneeScolaire = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1

  return (
    <figure className="carte-cantine-bloc">
      <article
        className={soldeBas ? 'carte-cantine carte-cantine-bas' : 'carte-cantine'}
        aria-label={`Carte cantine de ${profil.nom || 'ce compte'}, solde ${formaterMontant(profil.solde)}`}
      >
        <div className="carte-cantine-motif" aria-hidden="true" />

        <header className="carte-cantine-haut">
          <div className="logo carte-cantine-logo">
            Canti<em>Juste</em>
            <span className="surtitre">Cantine Vatel · Vallon</span>
          </div>
          <span className="carte-cantine-puce" aria-hidden="true" />
        </header>

        <div className="carte-cantine-solde">
          <span className="carte-cantine-libelle">Solde</span>
          <span className="carte-cantine-montant">{formaterMontant(profil.solde)}</span>
          <span className="carte-cantine-libelle">
            {Math.floor(profil.solde / prixRepas)} repas à {formaterMontant(prixRepas)}
          </span>
        </div>

        <footer className="carte-cantine-bas-de-carte">
          <div className="carte-cantine-identite">
            <span className="carte-cantine-libelle">Titulaire</span>
            <strong className="carte-cantine-nom">{profil.nom || 'Convive'}</strong>
          </div>
          <div className="carte-cantine-statut">
            <span className="carte-cantine-pastille">{estEmploye ? 'Employé' : 'Élève'}</span>
            <span className="carte-cantine-numero">{numeroDeCarte(profil.id)}</span>
          </div>
        </footer>
      </article>

      <figcaption className="carte-cantine-volet">
        <div className="carte-cantine-ligne">
          <Icone nom="ticket" className="icone-safran" />
          {ticketDuJour ? (
            <span>
              Aujourd’hui · <strong>{ticketDuJour.plat}</strong> · code{' '}
              <strong className="carte-cantine-code">{formaterCodeRetrait(ticketDuJour.code)}</strong>
              {' '}· {ticketDuJour.creneau ? `passe à ${formaterCreneau(ticketDuJour.creneau)}` : HORAIRE_SERVICE}
            </span>
          ) : (
            <span>Pas de repas réservé aujourd’hui.</span>
          )}
        </div>

        <div className="carte-cantine-ligne">
          <Icone nom={aSurveiller ? 'alerte' : 'bouclier'} className={aSurveiller ? 'icone-alerte' : 'icone-feuille'} />
          {aSurveiller ? (
            <span className="carte-cantine-allergies">
              {allergies.map((allergene) => (
                <span key={allergene.valeur} className="badge badge-erreur">
                  <Icone nom={allergene.icone} />
                  {allergene.libelle}
                </span>
              ))}
              {regime && <span className="badge badge-neutre">{regime}</span>}
              {profil.autre_allergie && <span className="badge badge-neutre">{profil.autre_allergie}</span>}
            </span>
          ) : (
            <span>Aucune allergie ni régime déclaré.</span>
          )}
        </div>

        <p className="mention carte-cantine-validite">
          Carte valable pour l’année {anneeScolaire}–{anneeScolaire + 1}. Elle se met à jour toute seule à chaque recharge et chaque repas.
        </p>
      </figcaption>
    </figure>
  )
}
