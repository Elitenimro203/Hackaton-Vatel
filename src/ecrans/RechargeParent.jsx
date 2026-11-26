// Onglet Recharger du parent : choix de l'enfant, paiement Mobile Money simulé, écran de succès et derniers mouvements de l'enfant.
import { useCallback, useEffect, useState } from 'react'
import { chargerEnfants } from '../lib/enfants'
import { chargerMesMouvements } from '../lib/mouvements'
import { useTempsReel } from '../lib/useTempsReel'
import ListeMouvements from '../composants/ListeMouvements'
import Vide from '../composants/Vide'
import RechargeMobileMoney from './RechargeMobileMoney'
import RechargeConfirmee from './RechargeConfirmee'
import Icone from '../composants/Icone'
import '../recharge.css'

export default function RechargeParent({ idEnfantChoisi, afficherToast, onVoirEnfants }) {
  const [enfants, setEnfants] = useState([])
  const [idEnfant, setIdEnfant] = useState(idEnfantChoisi)
  const [mouvements, setMouvements] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [recharge, setRecharge] = useState(null)

  const enfant = enfants.find((candidat) => candidat.id === idEnfant) || enfants[0]
  const idEnfantActif = enfant ? enfant.id : null

  const chargerLesEnfants = useCallback(async () => {
    const resultat = await chargerEnfants()
    setEnfants(resultat.enfants)
    setErreur(resultat.erreur)
    setChargement(false)
  }, [])

  const chargerLesMouvements = useCallback(async () => {
    if (!idEnfantActif) return
    const resultat = await chargerMesMouvements(idEnfantActif)
    setMouvements(resultat.mouvements)
  }, [idEnfantActif])

  useEffect(() => {
    chargerLesEnfants()
  }, [chargerLesEnfants])

  useEffect(() => {
    chargerLesMouvements()
  }, [chargerLesMouvements])

  useTempsReel('profiles', chargerLesEnfants)
  useTempsReel('mouvements', chargerLesMouvements)

  function terminer() {
    setRecharge(null)
    chargerLesEnfants()
    chargerLesMouvements()
    window.scrollTo(0, 0)
  }

  if (recharge) {
    return <RechargeConfirmee recharge={recharge} pourParent libelleRetour="Retour à l’espace parent" onRetour={terminer} />
  }

  if (chargement) {
    return (
      <section className="pile">
        <h1>Recharger</h1>
        <div className="chargement" aria-label="Chargement de vos enfants…">
          <div className="squelette" />
          <div className="squelette squelette-ligne" />
        </div>
      </section>
    )
  }

  if (erreur) {
    return (
      <section className="pile">
        <h1>Recharger</h1>
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger vos enfants</strong>
            <p>{erreur}</p>
          </div>
        </div>
      </section>
    )
  }

  if (!enfant) {
    return (
      <section className="pile">
        <h1>Recharger</h1>
        <Vide
          icone="carte-bancaire"
          titre="Aucun enfant à recharger"
          texte="Liez d’abord le compte CantiJuste de votre enfant pour recharger son solde."
          libelleBouton="Lier mon enfant"
          onAction={onVoirEnfants}
        />
      </section>
    )
  }

  const selecteur = enfants.length > 1 && (
    <fieldset className="groupe-choix">
      <legend className="libelle-groupe">Pour quel enfant ?</legend>
      <div className="tuiles-3">
        {enfants.map((candidat) => (
          <label key={candidat.id} className="tuile-paiement">
            <input
              type="radio"
              name="enfant"
              value={candidat.id}
              checked={candidat.id === enfant.id}
              onChange={() => setIdEnfant(candidat.id)}
            />
            {(candidat.nom || 'Enfant').trim().split(' ')[0]}
          </label>
        ))}
      </div>
    </fieldset>
  )

  return (
    <>
      <RechargeMobileMoney
        key={enfant.id}
        beneficiaire={enfant}
        pourParent
        titre="Espace parent"
        aide="Rechargez le compte cantine de votre enfant en quelques secondes."
        selecteur={selecteur}
        afficherToast={afficherToast}
        onPayee={setRecharge}
      />

      <div className="titre-section">
        <h2>Ses derniers mouvements</h2>
      </div>
      {mouvements.length === 0 ? (
        <Vide icone="recu" titre="Aucun mouvement pour l’instant" texte="Les recharges et les repas apparaîtront ici." />
      ) : (
        <ListeMouvements mouvements={mouvements} />
      )}
    </>
  )
}
