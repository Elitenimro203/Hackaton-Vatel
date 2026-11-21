// Page d'accueil avant connexion : photo, accroche, 3 atouts, connexion et comptes de démo en un clic.
import { useState } from 'react'
import { COMPTES_DEMO, MOT_DE_PASSE_DEMO, seConnecter } from '../lib/authentification'
 
const ATOUTS = [
  { emoji: '🌱', titre: 'Moins de gaspillage', texte: 'Chaque portion réservée est une portion mangée.' },
  { emoji: '🛡️', titre: 'Allergies protégées', texte: 'Chaque plat est vérifié avec ton profil.' },
  { emoji: '📱', titre: 'Zéro ticket papier', texte: 'Un code à 4 chiffres suffit au comptoir.' },
]
 
export default function Accueil({ onCreerCompte, afficherToast }) {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [roleDemoEnCours, setRoleDemoEnCours] = useState(null)
 
  async function connecter(evenement) {
    evenement.preventDefault()
    setErreur(null)
    setEnvoiEnCours(true)
    const message = await seConnecter(email, motDePasse)
    setEnvoiEnCours(false)
    if (message) setErreur(message)
  }
 
  async function connecterDemo(compte) {
    setErreur(null)
    setRoleDemoEnCours(compte.role)
    const message = await seConnecter(compte.email, MOT_DE_PASSE_DEMO)
    setRoleDemoEnCours(null)
    if (message) {
      afficherToast(`Compte ${compte.libelle} indisponible : ${message}`, 'erreur')
    }
  }
 
  const occupe = envoiEnCours || roleDemoEnCours !== null
 
  return (
    <main className="page">
      <section className="hero">
        <img className="hero-photo" src="/photos/accueil.jpg" alt="Poisson braisé, attiéké et sauce pimentée" />
        <div className="logo">
          Canti<em>Juste</em>
          <span className="surtitre">Cantine Vatel · Vallon</span>
        </div>
        <h1 className="hero-accroche">Le bon repas, pour la bonne personne, en bonne quantité.</h1>
        <p className="hero-sous-titre">Réserve ton plat la veille : la cuisine prépare juste ce qu’il faut.</p>
      </section>
 
      <ul className="atouts liste">
        {ATOUTS.map((atout) => (
          <li key={atout.titre} className="atout">
            <span className="atout-emoji" aria-hidden="true">{atout.emoji}</span>
            <div>
              <p className="atout-titre">{atout.titre}</p>
              <p className="atout-texte">{atout.texte}</p>
            </div>
          </li>
        ))}
      </ul>
 
      <form className="carte pile" onSubmit={connecter} noValidate>
        <div>
          <h2 className="titre-accueil">Content de te revoir</h2>
          <p className="aide">Cantine Vatel · Vallon</p>
        </div>
 
        <div className="champ">
          <label htmlFor="email-connexion">Ton adresse e-mail</label>
          <input
            id="email-connexion"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="awa.kone@vatel.ci"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
 
        <div className="champ">
          <label htmlFor="mdp-connexion">Ton mot de passe</label>
          <input
            id="mdp-connexion"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
          />
        </div>
 
        {erreur && (
          <div className="alerte alerte-erreur" role="alert">
            <strong>Connexion impossible</strong>
            <p>{erreur}</p>
          </div>
        )}
 
        <button type="submit" className="btn" disabled={occupe || !email || !motDePasse}>
          {envoiEnCours ? 'Connexion…' : 'Se connecter'}
        </button>
        <button type="button" className="btn btn-discret" onClick={onCreerCompte} disabled={occupe}>
          Créer un compte
        </button>
      </form>
 
      <section className="carte pile">
        <div>
          <span className="surtitre">Essayer en un clic</span>
          <h2 className="carte-titre">Comptes de démonstration</h2>
          <p className="mention">Mot de passe : {MOT_DE_PASSE_DEMO}</p>
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
              {roleDemoEnCours === compte.role ? '…' : compte.libelle}
            </button>
          ))}
        </div>
      </section>
 
      <footer className="pied-page">CantiJuste · Hackathon Vatel 2026</footer>
    </main>
  )
}
 