// Espace élève ou employé : bandeau « Solde bas » en haut, 4 onglets (À table, Menu, Mes repas, Profil), plus la fiche du plat, « C'est réservé » et la recharge Mobile Money.
import { useState } from 'react'
import BarreOnglets from '../composants/BarreOnglets'
import BandeauSoldeBas from '../composants/BandeauSoldeBas'
import CarteCantine from '../composants/CarteCantine'
import CarteProfilAlimentaire from '../composants/CarteProfilAlimentaire'
import ATable from './ATable'
import MenuSemaine from './MenuSemaine'
import FichePlat from './FichePlat'
import ReservationConfirmee from './ReservationConfirmee'
import MesRepas from './MesRepas'
import RechargeMobileMoney from './RechargeMobileMoney'
import RechargeConfirmee from './RechargeConfirmee'
import { soldeEstBas } from '../lib/recharges'
import { formaterMontant } from '../lib/formatage'

const ONGLETS = [
  { id: 'table', icone: 'a-table', libelle: 'À table' },
  { id: 'menu', icone: 'calendrier', libelle: 'Menu' },
  { id: 'repas', icone: 'recu', libelle: 'Mes repas' },
  { id: 'profil', icone: 'profil', libelle: 'Profil' },
]

export default function Eleve({ profil, afficherToast, onProfilModifie }) {
  const [ongletActif, setOngletActif] = useState('table')
  const [platOuvert, setPlatOuvert] = useState(null)
  const [platReserve, setPlatReserve] = useState(null)
  const [rechargeOuverte, setRechargeOuverte] = useState(false)
  const [rechargeReussie, setRechargeReussie] = useState(null)

  function choisirOnglet(idOnglet) {
    setPlatOuvert(null)
    setPlatReserve(null)
    setRechargeOuverte(false)
    setRechargeReussie(null)
    setOngletActif(idOnglet)
    window.scrollTo(0, 0)
  }

  function ouvrirPlat(menu) {
    setPlatOuvert(menu)
    window.scrollTo(0, 0)
  }

  function confirmerReservation(menu) {
    setPlatOuvert(null)
    setPlatReserve(menu)
    window.scrollTo(0, 0)
  }

  function ouvrirRecharge() {
    setRechargeOuverte(true)
    window.scrollTo(0, 0)
  }

  function terminerRecharge(recharge) {
    setRechargeOuverte(false)
    setRechargeReussie(recharge)
    onProfilModifie()
    window.scrollTo(0, 0)
  }

  // La recharge, la fiche du plat et l'écran de confirmation passent devant l'onglet en cours
  if (rechargeReussie) {
    return (
      <>
        <RechargeConfirmee recharge={rechargeReussie} libelleRetour="Voir mes repas" onRetour={() => choisirOnglet('repas')} />
        <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
      </>
    )
  }

  if (rechargeOuverte) {
    return (
      <>
        <RechargeMobileMoney
          beneficiaire={profil}
          titre="Recharger mon solde"
          afficherToast={afficherToast}
          onRetour={() => setRechargeOuverte(false)}
          onPayee={terminerRecharge}
        />
        <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
      </>
    )
  }

  if (platReserve) {
    return (
      <>
        <ReservationConfirmee menu={platReserve} profil={profil} onVoirMesRepas={() => choisirOnglet('repas')} />
        <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
      </>
    )
  }

  if (platOuvert) {
    return (
      <>
        <FichePlat
          menu={platOuvert}
          profil={profil}
          afficherToast={afficherToast}
          onRetour={() => setPlatOuvert(null)}
          onReserve={confirmerReservation}
          onModifierProfil={() => choisirOnglet('profil')}
        />
        <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
      </>
    )
  }

  return (
    <>
      {soldeEstBas(profil.solde) && (
        <BandeauSoldeBas
          titre="Solde bas : recharge avant demain"
          detail={`Il te reste ${formaterMontant(profil.solde)}`}
          onRecharger={ouvrirRecharge}
        />
      )}

      {ongletActif === 'table' && (
        <ATable
          profil={profil}
          onOuvrirPlat={ouvrirPlat}
          onVoirMenu={() => choisirOnglet('menu')}
          onVoirReservations={() => choisirOnglet('repas')}
        />
      )}

      {ongletActif === 'menu' && (
        <MenuSemaine profil={profil} onOuvrirPlat={ouvrirPlat} onVoirReservations={() => choisirOnglet('repas')} />
      )}

      {ongletActif === 'repas' && (
        <MesRepas
          profil={profil}
          afficherToast={afficherToast}
          onVoirMenu={() => choisirOnglet('menu')}
          onRecharger={ouvrirRecharge}
        />
      )}

      {ongletActif === 'profil' && (
        <section className="pile">
          <span className="surtitre">Ta carte cantine</span>
          <h1>Ta carte, toujours sur toi.</h1>
          <p className="aide">Montre-la au comptoir : la cuisine voit ton code du jour et tes allergies d’un seul coup d’œil.</p>
          <CarteCantine profil={profil} />

          <CarteProfilAlimentaire eleve={profil} afficherToast={afficherToast} onEnregistre={onProfilModifie} />
        </section>
      )}

      <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
    </>
  )
}
