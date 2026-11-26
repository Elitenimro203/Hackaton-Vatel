// Onglet Service de l'admin (maquette 14) : titre selon l'heure (avant, pendant, après le service), code de retrait au comptoir, bilan du jour, repas à préparer, répartition par plat, convives et allergies, en temps réel.
import { useCallback, useEffect, useState } from 'react'
import { chargerAllergiesDuJour, chargerProchainJourDeService } from '../lib/allergies'
import { chargerCommandesDuJour, phaseDuService, repartirParPlat, servirRepas } from '../lib/service'
import { ajouterJours, dateDuJour, formaterDate, formaterHeure, HORAIRE_SERVICE } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import GuichetRetrait from '../composants/GuichetRetrait'
import RepartitionPlats from '../composants/RepartitionPlats'
import ListeConvives from '../composants/ListeConvives'
import CarteAllergiesDuJour from '../composants/CarteAllergiesDuJour'
import Icone from '../composants/Icone'
import '../commandes.css'

const UNE_MINUTE = 60 * 1000

// Ce que dit l'écran selon le moment de la journée
const TEXTES_PHASE = {
  avant: { titre: 'Le service se prépare.', phrase: 'Ouverture du comptoir à 12 h.', libelleTotal: 'repas à préparer' },
  pendant: { titre: 'Service en cours.', phrase: 'Comptoir ouvert jusqu’à 14 h.', libelleTotal: 'repas à servir' },
  apres: { titre: 'Service terminé.', phrase: 'Le bilan du jour, ticket par ticket.', libelleTotal: 'repas réservés' },
}

export default function AdminCommandes({ afficherToast, onVoirMenus }) {
  const aujourdhui = dateDuJour()
  const [jour, setJour] = useState(aujourdhui)
  const [commandes, setCommandes] = useState([])
  const [allergies, setAllergies] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [miseAJour, setMiseAJour] = useState(null)
  const [resultat, setResultat] = useState(null)
  const [numeroResultat, setNumeroResultat] = useState(0)
  const [codeEnCours, setCodeEnCours] = useState(null)
  const [lendemain, setLendemain] = useState(null)
  const [maintenant, setMaintenant] = useState(() => new Date())
  const estAujourdhui = jour === aujourdhui
  const phase = estAujourdhui ? phaseDuService(maintenant) : 'avant'
  const textes = TEXTES_PHASE[phase]

  // Le titre change seul à 12 h et à 14 h
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(new Date()), UNE_MINUTE)
    return () => clearInterval(minuteur)
  }, [])

  // Jour affiché : aujourd'hui s'il a un menu, sinon le prochain jour de service
  const charger = useCallback(async () => {
    const prochain = await chargerProchainJourDeService(aujourdhui)
    const suivant = await chargerProchainJourDeService(ajouterJours(prochain.jour, 1))
    const [resultatCommandes, resultatAllergies, resultatSuivant] = await Promise.all([
      chargerCommandesDuJour(prochain.jour),
      chargerAllergiesDuJour(prochain.jour),
      chargerCommandesDuJour(suivant.jour),
    ])
    setJour(prochain.jour)
    setLendemain({ jour: suivant.jour, total: resultatSuivant.commandes.length })
    setCommandes(resultatCommandes.commandes)
    setAllergies(resultatAllergies.lignes)
    setErreur(prochain.erreur || resultatCommandes.erreur || resultatAllergies.erreur)
    setMiseAJour(new Date())
    setChargement(false)
  }, [aujourdhui])

  useEffect(() => {
    charger()
  }, [charger])

  // Une réservation ou un service arrive (ici ou sur un autre poste) : tout se met à jour seul
  useTempsReel('reservations', charger)

  // Même fonction pour le champ du guichet et pour le bouton « Servi » d'une ligne
  async function servir(code, depuisLaListe = false) {
    setCodeEnCours(code)
    const reponse = await servirRepas(code)
    setCodeEnCours(null)

    if (reponse.erreur) {
      afficherToast(reponse.erreur, 'erreur')
      return
    }
    setResultat(reponse.resultat)
    setNumeroResultat((numero) => numero + 1)
    if (depuisLaListe) {
      const servi = reponse.resultat.ok
      afficherToast(servi ? `Repas servi à ${reponse.resultat.prenom} : ${reponse.resultat.plat}.` : reponse.resultat.message, servi ? 'succes' : 'erreur')
    }
    if (reponse.resultat.ok) charger()
  }

  const total = commandes.length
  const servis = commandes.filter((commande) => commande.statut === 'servie').length
  const restant = total - servis
  const plats = repartirParPlat(commandes)

  return (
    <section className="pile">
      <div>
        <h1 className="admin-titre">{textes.titre}</h1>
        <p className="aide premiere-majuscule">
          {formaterDate(jour)} · Service de {HORAIRE_SERVICE}
        </p>
      </div>

      {!chargement && !erreur && !estAujourdhui && (
        <div className="alerte alerte-info">
          <Icone nom="calendrier" />
          <div>
            <strong>Pas de service aujourd’hui</strong>
            <p>Voici les commandes du {formaterDate(jour)}. Les tickets se servent le jour même.</p>
          </div>
        </div>
      )}

      {phase !== 'apres' && (
        <GuichetRetrait
          resultat={resultat}
          numeroResultat={numeroResultat}
          enCours={Boolean(codeEnCours)}
          onServir={(code) => servir(code)}
        />
      )}

      {chargement && (
        <div className="chargement" aria-label="Chargement des commandes…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger les commandes</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && (
        <>
          <section className="carte-repas" aria-label="Repas à préparer">
            <span className="repas-nombre">{total}</span>
            <div>
              <h2 className="repas-titre">{textes.libelleTotal}</h2>
              <p className="aide">{textes.phrase}</p>
            </div>
            <div className="repas-maj">
              <strong>
                <span className="texte-feuille">{servis} servi{servis > 1 ? 's' : ''}</span> ·{' '}
                <span className="texte-safran">
                  {restant} {phase === 'apres' ? `pas retiré${restant > 1 ? 's' : ''}` : 'à servir'}
                </span>
              </strong>
              <span className="mention">Mis à jour à {formaterHeure(miseAJour)}</span>
            </div>
          </section>

          {phase === 'apres' && lendemain && lendemain.jour !== jour && (
            <div className="alerte alerte-info">
              <Icone nom="calendrier" />
              <div>
                <strong className="premiere-majuscule">
                  {formaterDate(lendemain.jour)} : {lendemain.total} repas réservé{lendemain.total > 1 ? 's' : ''}
                </strong>
                <p>Les réservations ferment la veille à 18&nbsp;h : après, ce chiffre ne bouge plus.</p>
              </div>
            </div>
          )}

          {plats.length > 0 && <RepartitionPlats plats={plats} total={total} termine={phase === 'apres'} />}

          <div className="commandes-bas">
            <CarteAllergiesDuJour lignes={allergies} jour={jour} estAujourdhui={estAujourdhui} />
            <ListeConvives
              commandes={commandes}
              peutServir={estAujourdhui}
              titre={phase === 'apres' ? 'Les convives du jour' : undefined}
              codeEnCours={codeEnCours}
              onServir={(code) => servir(code, true)}
              onVoirMenus={onVoirMenus}
            />
          </div>
        </>
      )}
    </section>
  )
}
