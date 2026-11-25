// Onglet Commandes du jour de l'admin (maquette 14) : code de retrait au comptoir, repas à préparer, répartition par plat, convives et allergies, en temps réel.
import { useCallback, useEffect, useState } from 'react'
import { chargerAllergiesDuJour, chargerProchainJourDeService } from '../lib/allergies'
import { chargerCommandesDuJour, repartirParPlat, servirRepas } from '../lib/service'
import { dateDuJour, formaterDate, formaterHeure, HORAIRE_SERVICE } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import GuichetRetrait from '../composants/GuichetRetrait'
import RepartitionPlats from '../composants/RepartitionPlats'
import ListeConvives from '../composants/ListeConvives'
import CarteAllergiesDuJour from '../composants/CarteAllergiesDuJour'
import Icone from '../composants/Icone'
import '../commandes.css'

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
  const estAujourdhui = jour === aujourdhui

  // Jour affiché : aujourd'hui s'il a un menu, sinon le prochain jour de service
  const charger = useCallback(async () => {
    const prochain = await chargerProchainJourDeService(aujourdhui)
    const [resultatCommandes, resultatAllergies] = await Promise.all([
      chargerCommandesDuJour(prochain.jour),
      chargerAllergiesDuJour(prochain.jour),
    ])
    setJour(prochain.jour)
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
        <h1 className="admin-titre">Le service se prépare.</h1>
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

      <GuichetRetrait
        resultat={resultat}
        numeroResultat={numeroResultat}
        enCours={Boolean(codeEnCours)}
        onServir={(code) => servir(code)}
      />

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
              <h2 className="repas-titre">repas à préparer</h2>
              <p className="aide">Des réservations justes. Des assiettes bien remplies.</p>
            </div>
            <div className="repas-maj">
              <span className="mention texte-safran">Dernière mise à jour · {formaterHeure(miseAJour)}</span>
              <strong>
                {total} réservation{total > 1 ? 's' : ''} confirmée{total > 1 ? 's' : ''}
              </strong>
            </div>
          </section>

          <div className="grille-chiffres grille-chiffres-3">
            <div className="chiffre">
              <span className="chiffre-nombre">{total}</span>
              <span className="chiffre-libelle">Réservés</span>
            </div>
            <div className="chiffre chiffre-feuille">
              <span className="chiffre-nombre">{servis}</span>
              <span className="chiffre-libelle">Servis</span>
            </div>
            <div className="chiffre chiffre-safran">
              <span className="chiffre-nombre">{restant}</span>
              <span className="chiffre-libelle">Restant à servir</span>
            </div>
          </div>

          {plats.length > 0 && <RepartitionPlats plats={plats} total={total} />}

          <div className="commandes-bas">
            <ListeConvives
              commandes={commandes}
              peutServir={estAujourdhui}
              codeEnCours={codeEnCours}
              onServir={(code) => servir(code, true)}
              onVoirMenus={onVoirMenus}
            />
            <CarteAllergiesDuJour lignes={allergies} jour={jour} estAujourdhui={estAujourdhui} />
          </div>
        </>
      )}
    </section>
  )
}
