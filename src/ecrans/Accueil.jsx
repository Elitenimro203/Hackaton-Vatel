// Page d'accueil avant connexion : photo, accroche, carte de connexion (ou mot de passe oublié) posée sur la photo, comptes de démo et 3 atouts.
import { useEffect, useState } from 'react'
import { COMPTES_DEMO, MOT_DE_PASSE_DEMO, lienRecuperationExpire, seConnecter } from '../lib/authentification'
import FormulaireConnexion from '../composants/FormulaireConnexion'
import FormulaireMotDePasseOublie from '../composants/FormulaireMotDePasseOublie'
import Icone from '../composants/Icone'

const ATOUTS = [
  { icone: 'pousse', texte: 'Moins de gaspillage' },
  { icone: 'bouclier', texte: 'Allergies vérifiées' },
  { icone: 'ticket', texte: 'Code à 4 chiffres' },
]

const ICONES_DEMO = { eleve: 'profil', parent: 'enfants', cantine: 'service', admin: 'pilotage' }

export default function Accueil({ onCreerCompte, afficherToast }) {
  const [vue, setVue] = useState('connexion')
  const [email, setEmail] = useState('')
  const [connexionEnCours, setConnexionEnCours] = useState(false)
  const [roleDemoEnCours, setRoleDemoEnCours] = useState(null)

  // Lien « mot de passe oublié » trop vieux ou déjà utilisé : on le dit et on propose d'en redemander un
  useEffect(() => {
    if (lienRecuperationExpire()) {
      setVue('oubli')
      afficherToast('Ce lien a expiré. Demande un nouveau lien.', 'erreur')
    }
  }, [afficherToast])

  async function connecterDemo(compte) {
    setRoleDemoEnCours(compte.role)
    const message = await seConnecter(compte.email, MOT_DE_PASSE_DEMO)
    setRoleDemoEnCours(null)
    if (message) afficherToast(`Compte ${compte.libelle} indisponible : ${message}`, 'erreur')
  }

  const occupe = connexionEnCours || roleDemoEnCours !== null

  return (
    <main className="page">
      <section className="hero hero-connexion">
        <img className="hero-photo" src="/photos/accueil.jpg" alt="Poisson braisé, attiéké et sauce pimentée" />
        <div className="logo">
          Canti<em>Juste</em>
          <span className="surtitre">Cantine Vatel · Vallon</span>
        </div>
        <h1 className="hero-accroche">Le bon repas, pour la bonne personne, en bonne quantité.</h1>
      </section>

      <section className="carte-connexion" aria-live="polite">
        {vue === 'connexion' ? (
          <FormulaireConnexion
            email={email}
            onEmail={setEmail}
            occupe={occupe}
            onOccupe={setConnexionEnCours}
            onMotDePasseOublie={() => setVue('oubli')}
            onCreerCompte={onCreerCompte}
          />
        ) : (
          <FormulaireMotDePasseOublie email={email} onEmail={setEmail} onRetour={() => setVue('connexion')} />
        )}
      </section>

      <section className="demo-rapide pile-serree">
        <div className="espace-entre">
          <span className="surtitre">Essayer en un clic</span>
          <span className="mention">Mot de passe : {MOT_DE_PASSE_DEMO}</span>
        </div>
        <div className="demo-grille">
          {COMPTES_DEMO.map((compte) => (
            <button
              key={compte.role}
              type="button"
              className="btn btn-secondaire btn-demo"
              onClick={() => connecterDemo(compte)}
              disabled={occupe}
              title={compte.email}
            >
              <Icone nom={ICONES_DEMO[compte.role]} />
              {roleDemoEnCours === compte.role ? '…' : compte.libelle}
            </button>
          ))}
        </div>
      </section>

      <ul className="atouts-ligne liste">
        {ATOUTS.map((atout) => (
          <li key={atout.texte} className="atout-mini">
            <Icone nom={atout.icone} />
            {atout.texte}
          </li>
        ))}
      </ul>

      <footer className="pied-page">CantiJuste · Hackathon Vatel 2026</footer>
    </main>
  )
}
