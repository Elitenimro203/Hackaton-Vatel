// Onglet Mes repas de l'élève : solde en temps réel avec bouton Recharger (l'alerte solde bas est en haut de l'écran, dans Eleve), tickets à venir (annulables avant la veille 18 h, puis « Je ne viendrai pas » jusqu'à 10 h avec la moitié rendue), repas servis à noter (étoiles + mot pour la cuisine), historique et mouvements.
import { useCallback, useEffect, useState } from 'react'
import {
  absencePossible,
  annulerReservation,
  chargerHistoriqueReservations,
  reservationFermee,
  signalerAbsence,
  statutAffiche,
} from '../lib/reservations'
import { chargerMesMouvements } from '../lib/mouvements'
import { chargerMesAvis } from '../lib/avis'
import { PRIX_ELEVE_PAR_DEFAUT, PRIX_EMPLOYE_PAR_DEFAUT } from '../lib/menus'
import { dateDuJour, formaterDate, formaterMontant } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import TicketRetrait from '../composants/TicketRetrait'
import NoterRepas from '../composants/NoterRepas'
import Vide from '../composants/Vide'
import ListeMouvements from '../composants/ListeMouvements'
import Icone from '../composants/Icone'
import '../reservation.css'
import '../recharge.css'

function estAVenir(reservation, aujourdhui) {
  return reservation.statut === 'reservee' && reservation.menus.jour >= aujourdhui
}

export default function MesRepas({ profil, afficherToast, onVoirMenu, onRecharger }) {
  const [reservations, setReservations] = useState([])
  const [mouvements, setMouvements] = useState([])
  const [avis, setAvis] = useState({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [aAnnuler, setAAnnuler] = useState(null)
  const [enAbsence, setEnAbsence] = useState(false)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)
  const aujourdhui = dateDuJour()
  const prixRepas = profil.type_usager === 'employe' ? PRIX_EMPLOYE_PAR_DEFAUT : PRIX_ELEVE_PAR_DEFAUT

  const charger = useCallback(async () => {
    const resultatReservations = await chargerHistoriqueReservations(profil.id)
    const resultatMouvements = await chargerMesMouvements(profil.id)
    const resultatAvis = await chargerMesAvis(profil.id)
    setReservations(resultatReservations.reservations)
    setMouvements(resultatMouvements.mouvements)
    setAvis(resultatAvis.avis)
    setErreur(resultatReservations.erreur || resultatMouvements.erreur)
    setChargement(false)
  }, [profil.id])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('reservations', charger, `eleve_id=eq.${profil.id}`)
  useTempsReel('mouvements', charger, `eleve_id=eq.${profil.id}`)

  const tickets = reservations
    .filter((reservation) => estAVenir(reservation, aujourdhui))
    .sort((a, b) => a.menus.jour.localeCompare(b.menus.jour))
  const servis = reservations
    .filter((reservation) => reservation.statut === 'servie')
    .sort((a, b) => b.menus.jour.localeCompare(a.menus.jour))
  const historique = reservations.filter((reservation) => !estAVenir(reservation, aujourdhui) && reservation.statut !== 'servie')

  // absence = true : après la veille 18 h, on prévient la cantine et on récupère la moitié
  function ouvrirAnnulation(reservation, absence) {
    setEnAbsence(absence)
    setAAnnuler(reservation)
  }

  async function confirmerAnnulation() {
    setAnnulationEnCours(true)
    const resultat = enAbsence
      ? await signalerAbsence(aAnnuler.id)
      : { erreur: await annulerReservation(aAnnuler.id), rendu: aAnnuler.montant }
    setAnnulationEnCours(false)
    setAAnnuler(null)

    if (resultat.erreur) {
      afficherToast(resultat.erreur, 'erreur')
      return
    }
    afficherToast(
      enAbsence
        ? `La cantine est prévenue : ${formaterMontant(resultat.rendu)} remis sur ton solde.`
        : `Repas annulé : ${formaterMontant(resultat.rendu)} remis sur ton solde.`,
    )
    charger()
  }

  return (
    <section className="pile">
      <h1>Mes repas</h1>
      <p className="aide">Ton solde, tes tickets et tes repas passés.</p>

      <div className="carte-solde">
        <div>
          <span className="surtitre">Ton solde</span>
          <span className="montant">{formaterMontant(profil.solde)}</span>
          <span className="mention">
            {Math.floor(profil.solde / prixRepas)} repas à {formaterMontant(prixRepas)}
          </span>
        </div>
        <button type="button" className="btn-recharger" onClick={onRecharger}>
          <Icone nom="telephone" />
          Recharger
        </button>
      </div>

      <div className="titre-section">
        <h2>Tes tickets à venir</h2>
        {tickets.length > 0 && <span className="mention">{tickets.length} réservé{tickets.length > 1 ? 's' : ''}</span>}
      </div>

      {chargement && (
        <div className="chargement" aria-label="Chargement de tes repas…">
          <div className="squelette squelette-ticket" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger tes repas</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && tickets.length === 0 && (
        <Vide
          icone="a-table"
          titre="Aucun repas réservé."
          texte="Choisis un plat dans la semaine : ton ticket apparaîtra ici."
          libelleBouton="Voir la semaine"
          onAction={onVoirMenu}
        />
      )}

      {!chargement && tickets.map((reservation) => (
        <div key={reservation.id} className="ticket-bloc">
          <TicketRetrait
            plat={reservation.menus.plat}
            jour={reservation.menus.jour}
            code={reservation.code_retrait}
            creneau={reservation.creneau}
          />
          {!reservationFermee(reservation.menus.jour) && (
            <button type="button" className="btn btn-danger" onClick={() => ouvrirAnnulation(reservation, false)}>
              Annuler · récupérer {formaterMontant(reservation.montant)}
            </button>
          )}
          {absencePossible(reservation.menus.jour) && (
            <>
              <button type="button" className="btn btn-danger" onClick={() => ouvrirAnnulation(reservation, true)}>
                Je ne viendrai pas · récupérer {formaterMontant(Math.floor(reservation.montant / 2))}
              </button>
              <p className="mention centre">Ta portion est déjà commandée : prévenir avant 10 h rend la moitié du repas.</p>
            </>
          )}
          {reservationFermee(reservation.menus.jour) && !absencePossible(reservation.menus.jour) && (
            <p className="mention centre">La cuisine prépare ton assiette. Un repas pas retiré n’est pas remboursé.</p>
          )}
        </div>
      ))}

      {!chargement && servis.length > 0 && (
        <>
          <div className="titre-section">
            <h2>Tes repas servis</h2>
          </div>
          <ul className="liste-avis">
            {servis.map((reservation) => (
              <li key={reservation.id}>
                <NoterRepas
                  reservation={reservation}
                  avisExistant={avis[reservation.menu_id]}
                  onEnvoye={charger}
                  afficherToast={afficherToast}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {!chargement && historique.length > 0 && (
        <>
          <div className="titre-section">
            <h2>Historique</h2>
          </div>
          <ul className="carte liste-repas">
            {historique.map((reservation) => {
              const statut = statutAffiche(reservation)
              return (
                <li key={reservation.id} className="carte-ligne">
                  <div>
                    <p className="nom-plat nom-plat-ligne">{reservation.menus.plat}</p>
                    <p className="mention">{formaterDate(reservation.menus.jour)}</p>
                  </div>
                  <span className={statut.classe}>{statut.libelle}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {!chargement && !erreur && (
        <>
          <div className="titre-section">
            <h2>Tes mouvements</h2>
          </div>
          {mouvements.length === 0 ? (
            <Vide
              icone="recu"
              titre="Aucun mouvement pour l’instant"
              texte="Tes recharges et tes repas apparaîtront ici."
              libelleBouton="Recharger par Mobile Money"
              onAction={onRecharger}
            />
          ) : (
            <ListeMouvements mouvements={mouvements} />
          )}
        </>
      )}

      {aAnnuler && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-annulation">
            <h2 id="titre-annulation">{enAbsence ? 'Tu ne viendras pas\u00A0?' : 'Annuler ton repas\u00A0?'}</h2>
            <p className="aide">
              {aAnnuler.menus.plat}, {formaterDate(aAnnuler.menus.jour)}.{' '}
              {enAbsence
                ? `La cuisine a déjà commandé ta portion : tu récupères ${formaterMontant(Math.floor(aAnnuler.montant / 2))}, la moitié du repas.`
                : `Tu récupères ${formaterMontant(aAnnuler.montant)} tout de suite.`}
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setAAnnuler(null)} disabled={annulationEnCours}>
              Garder mon repas
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmerAnnulation} disabled={annulationEnCours}>
              {annulationEnCours ? 'Envoi…' : enAbsence ? 'Oui, prévenir la cantine' : 'Oui, annuler'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
