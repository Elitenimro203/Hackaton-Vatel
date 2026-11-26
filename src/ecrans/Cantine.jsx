// Espace du personnel de cantine : onglets Comptoir (remettre les repas) et Convives (liste du jour, allergies). Ni finances, ni menus, ni stocks.
import { useState } from 'react'
import BarreOnglets from '../composants/BarreOnglets'
import Comptoir from './Comptoir'
import Convives from './Convives'

const ONGLETS = [
  { id: 'comptoir', icone: 'service', libelle: 'Comptoir' },
  { id: 'convives', icone: 'enfants', libelle: 'Convives' },
]

export default function Cantine({ afficherToast }) {
  const [ongletActif, setOngletActif] = useState('comptoir')

  function choisirOnglet(idOnglet) {
    setOngletActif(idOnglet)
    window.scrollTo(0, 0)
  }

  return (
    <>
      {ongletActif === 'comptoir' && <Comptoir afficherToast={afficherToast} />}
      {ongletActif === 'convives' && <Convives />}
      <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
    </>
  )
}
