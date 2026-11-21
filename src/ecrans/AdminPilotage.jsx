// Onglet Pilotage de l'admin (maquette 15) : gaspillage évité, repas à préparer, taux de gaspillage, réservés/servis sur 4 semaines, prévision et favoris, en temps réel.
import { useCallback, useEffect, useState } from 'react'
import { chargerTableauDeBord } from '../lib/pilotage'
import {
  dateDuJour,
  formaterDateAvecAnnee,
  formaterHeure,
  formaterMoisPrecedent,
  formaterMontant,
  formaterNombre,
  formaterNomJour,
  formaterPourcent,
} from '../lib/formatage'
import { useTempsReel } from '../useTempsReel'
import GraphiqueService from '../composants/GraphiqueService'
import PrevisionSemaine from '../composants/PrevisionSemaine'
import FavorisCantine from '../composants/FavorisCantine'
import Vide from '../composants/Vide'
import AdminSoldes from './AdminSoldes'
import CarteProfil from '../composants/CarteProfil'
import '../pilotage.css'

// Ligne verte (pertes en baisse) ou piment (pertes en hausse) sous le montant
function LigneEvolution({ evolution, aujourdhui }) {
  if (evolution === null || evolution === undefined) return null
  const enBaisse = evolution <= 0
  const valeur = `${enBaisse ? '−' : '+'}${formaterPourcent(Math.abs(evolution))}`
  return (
    <p className={enBaisse ? 'evolution' : 'evolution evolution-hausse'}>
      {valeur} de pertes par rapport à {formaterMoisPrecedent(aujourdhui)}
    </p>
  )
}

export default function AdminPilotage({ profil, afficherToast, onVoirCommandes, onVoirMenus }) {
  const aujourdhui = dateDuJour()
  const [tableau, setTableau] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [miseAJour, setMiseAJour] = useState(null)

  const charger = useCallback(async () => {
    const resultat = await chargerTableauDeBord()
    setTableau(resultat)
    setMiseAJour(new Date())
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // Une réservation, un repas servi ou un avis arrive : les chiffres se recalculent seuls
  useTempsReel('reservations', charger)
  useTempsReel('avis', charger)

  async function reessayer() {
    setChargement(true)
    await charger()
  }

  const chiffres = tableau?.chiffres

  return (
    <section className="pile pilotage">
      <div className="admin-entete">
        <span className="surtitre">Cantine Vatel · Vallon</span>
        <span className="mention premiere-lettre">{formaterDateAvecAnnee(aujourdhui)}</span>
      </div>
      <div>
        <h1 className="admin-titre">Du goût. Moins de pertes.</h1>
        <p className="aide">Chaque réservation compte. Voici l’impact de la cantine ce mois-ci.</p>
        {miseAJour && (
          <p className="mention en-direct">
            <span className="point point-feuille" aria-hidden="true" /> En direct · mis à jour à {formaterHeure(miseAJour)}
          </p>
        )}
      </div>

      {chargement && (
        <div className="chargement" aria-label="Chargement du tableau de bord…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && tableau?.erreur && (
        <div className="pile">
          <div className="alerte alerte-erreur" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>Impossible de charger le tableau de bord</strong>
              <p>{tableau.erreur} Vérifiez que supabase/patch_tableau_de_bord.sql a bien été lancé.</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondaire" onClick={reessayer}>
            Réessayer
          </button>
        </div>
      )}

      {!chargement && !tableau?.erreur && (
        <>
          <section className="pile" aria-labelledby="titre-cuisiner-juste">
            <h2 id="titre-cuisiner-juste" className="surtitre">CantiJuste · cuisiner juste ce qu’il faut</h2>

            <div className="pilotage-chiffres">
              <div className="carte-vedette pilotage-vedette">
                <span className="surtitre">Gaspillage évité ce mois</span>
                <span className="chiffre-vedette">
                  {formaterNombre(chiffres?.fcfa_evites ?? 0)}
                  <small>FCFA</small>
                </span>
                <p className="vedette-repas">
                  soit <strong>{formaterNombre(chiffres?.repas_evites ?? 0)} repas</strong> qui ne finissent pas à la poubelle
                </p>
                <LigneEvolution evolution={chiffres?.evolution_pertes} aujourdhui={aujourdhui} />
                <p className="mention">
                  Hypothèse : une cantine sans réservation prépare {chiffres?.surplus_sans_resa ?? 15} % de trop.
                  Prix moyen d’un repas : {formaterMontant(chiffres?.prix_moyen ?? 1000, 'FCFA')}.
                </p>
              </div>

              <div className="chiffre pilotage-chiffre chiffre-safran">
                <span className="chiffre-nombre">{formaterNombre(chiffres?.repas_a_preparer ?? 0)}</span>
                <span className="chiffre-libelle">
                  repas à préparer {chiffres?.jour_a_preparer ? formaterNomJour(chiffres.jour_a_preparer) : ''}
                </span>
                <span className="mention">Marge de 5 % comprise</span>
              </div>

              <div className="chiffre pilotage-chiffre">
                <span className="chiffre-nombre">{formaterPourcent(chiffres?.taux_gaspillage)}</span>
                <span className="chiffre-libelle">taux de gaspillage</span>
                <span className="mention">Réservés mais pas servis, ce mois-ci</span>
              </div>
            </div>

            <div className="pilotage-milieu">
              <section className="carte pilotage-carte" aria-labelledby="titre-graphique">
                <h2 id="titre-graphique" className="titre-pilotage">Réservés, puis savourés.</h2>
                {tableau.historique.length === 0 ? (
                  <Vide
                    emoji="📊"
                    titre="Pas encore d’historique"
                    texte="Le graphique se remplit après les premiers jours de service."
                    libelleBouton="Voir les commandes du jour"
                    onAction={onVoirCommandes}
                  />
                ) : (
                  <>
                    <GraphiqueService jours={tableau.historique} />
                    <p className="mention">
                      4 dernières semaines, un jour par paire de barres. L’écart, ce sont les repas réservés mais pas venus.
                    </p>
                  </>
                )}
              </section>

              <PrevisionSemaine jours={tableau.prevision} />
            </div>
          </section>

          <FavorisCantine favoris={tableau.favoris} onVoirMenus={onVoirMenus} />
        </>
      )}

      <AdminSoldes afficherToast={afficherToast} />
      <CarteProfil profil={profil} afficherToast={afficherToast} />
    </section>
  )
}
