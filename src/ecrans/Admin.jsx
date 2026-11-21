// Espace admin : onglets Pilotage (tableau de bord et crédit des comptes), Commandes du jour (comptoir), Menus, File d'attente, Stocks, Insights (barre latérale sur PC, onglets en bas sur téléphone).
import { useState } from 'react'
import { seDeconnecter } from '../lib/authentification'
import BarreOnglets from '../composants/BarreOnglets'
import AdminMenus from './AdminMenus'
import AdminCommandes from './AdminCommandes'
import AdminPilotage from './AdminPilotage'
import FileAttente from './admin/FileAttente'
import Stocks from './admin/Stocks'
import Insights from './admin/Insights'
import '../admin.css'

const ONGLETS = [
  { id: 'pilotage', icone: '📊', libelle: 'Pilotage' },
  { id: 'commandes', icone: '🍳', libelle: 'Commandes' },
  { id: 'menus', icone: '📅', libelle: 'Menus' },
  { id: 'file', icone: '⏱️', libelle: 'File' },
  { id: 'stocks', icone: '📦', libelle: 'Stocks' },
  { id: 'insights', icone: '💬', libelle: 'Insights' },
]

export default function Admin({ profil, afficherToast }) {
  const [ongletActif, setOngletActif] = useState('pilotage')
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false)

  function choisirOnglet(idOnglet) {
    setOngletActif(idOnglet)
    window.scrollTo(0, 0)
  }

  async function deconnecter() {
    setDeconnexionEnCours(true)
    const erreur = await seDeconnecter()
    if (erreur) {
      afficherToast(erreur, 'erreur')
      setDeconnexionEnCours(false)
    }
  }

  return (
    <div className="admin">
      <aside className="barre-laterale">
        <div className="logo">
          Canti<em>Juste</em>
          <span className="surtitre">L’atelier de la cantine</span>
        </div>
        <nav className="menu-lateral" aria-label="Navigation admin">
          {ONGLETS.map((onglet) => (
            <button
              key={onglet.id}
              type="button"
              className={onglet.id === ongletActif ? 'lien-lateral actif' : 'lien-lateral'}
              aria-current={onglet.id === ongletActif ? 'page' : undefined}
              onClick={() => choisirOnglet(onglet.id)}
            >
              <span aria-hidden="true">{onglet.icone}</span> {onglet.libelle}
            </button>
          ))}
        </nav>
        <div className="barre-laterale-pied">
          <strong>Cantine Vatel · Vallon</strong>
          <span>Service · 12 h – 14 h</span>
          <span className="badge badge-succes">● Cantine ouverte</span>
          <button type="button" className="btn btn-secondaire" onClick={deconnecter} disabled={deconnexionEnCours}>
            {deconnexionEnCours ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </aside>

      <div className="admin-contenu">
        {ongletActif === 'pilotage' && (
          <AdminPilotage
            profil={profil}
            afficherToast={afficherToast}
            onVoirCommandes={() => choisirOnglet('commandes')}
            onVoirMenus={() => choisirOnglet('menus')}
          />
        )}

        {ongletActif === 'commandes' && (
          <AdminCommandes afficherToast={afficherToast} onVoirMenus={() => choisirOnglet('menus')} />
        )}

        {ongletActif === 'menus' && <AdminMenus afficherToast={afficherToast} />}

        {ongletActif === 'file' && <FileAttente />}

        {ongletActif === 'stocks' && <Stocks afficherToast={afficherToast} />}

        {ongletActif === 'insights' && <Insights afficherToast={afficherToast} />}
      </div>

      <BarreOnglets onglets={ONGLETS} ongletActif={ongletActif} onChoisir={choisirOnglet} />
    </div>
  )
}
