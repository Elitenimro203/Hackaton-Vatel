// Espace parent : bandeau « Solde bas » par enfant en haut de l'écran, puis onglets Mes enfants, Recharger (Mobile Money simulé) et Ce qu'il mange. La déconnexion est derrière le prénom, en haut à droite.
import { useCallback, useEffect, useState } from 'react'
import { chargerEnfants, prenomDe } from '../lib/enfants'
import { soldeEstBas } from '../lib/recharges'
import { formaterMontant } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import BarreOnglets from '../composants/BarreOnglets'
import BandeauSoldeBas from '../composants/BandeauSoldeBas'
import MesEnfants from './MesEnfants'
import RechargeParent from './RechargeParent'
import CeQuilMange from './CeQuilMange'

const ONGLETS = [
  { id: 'enfants', icone: 'enfants', libelle: 'Mes enfants' },
  { id: 'recharger', icone: 'carte-bancaire', libelle: 'Recharger' },
  { id: 'repas', icone: 'a-table', libelle: 'Ce qu’il mange' },
]

export default function Parent({ afficherToast }) {
  const [ongletActif, setOngletActif] = useState('enfants')
  const [idEnfantARecharger, setIdEnfantARecharger] = useState(null)
  const [enfantsSoldeBas, setEnfantsSoldeBas] = useState([])

  // Les enfants sous le seuil, pour les bandeaux du haut (mis à jour en temps réel)
  const chargerSoldes = useCallback(async () => {
    const resultat = await chargerEnfants()
    setEnfantsSoldeBas(resultat.enfants.filter((enfant) => soldeEstBas(enfant.solde)))
  }, [])

  useEffect(() => {
    chargerSoldes()
  }, [chargerSoldes])

  useTempsReel('profiles', chargerSoldes)

  function choisirOnglet(idOnglet) {
    setOngletActif(idOnglet)
    window.scrollTo(0, 0)
  }

  function rechargerEnfant(idEnfant) {
    setIdEnfantARecharger(idEnfant)
    choisirOnglet('recharger')
  }

  // L'onglet Recharger affiche déjà le solde bas dans sa propre carte
  const afficherBandeaux = ongletActif !== 'recharger'

  return (
    <>
      {afficherBandeaux && enfantsSoldeBas.map((enfant) => (
        <BandeauSoldeBas
          key={enfant.id}
          titre="Solde bas : rechargez avant demain"
          detail={`${prenomDe(enfant)} · ${formaterMontant(enfant.solde)}`}
          onRecharger={() => rechargerEnfant(enfant.id)}
        />
      ))}

      {ongletActif === 'enfants' && <MesEnfants afficherToast={afficherToast} onRecharger={rechargerEnfant} onLiensModifies={chargerSoldes} />}

      {ongletActif === 'recharger' && (
        <RechargeParent
          idEnfantChoisi={idEnfantARecharger}
          afficherToast={afficherToast}
          onVoirEnfants={() => choisirOnglet('enfants')}
        />
      )}

      {ongletActif === 'repas' && <CeQuilMange onVoirEnfants={() => choisirOnglet('enfants')} />}

      <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
    </>
  )
}
