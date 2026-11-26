// Formulaire de connexion de l'accueil : e-mail, mot de passe (œil), lien « Mot de passe oublié ? », puis création de compte.
import { useState } from 'react'
import { seConnecter } from '../lib/authentification'
import ChampMotDePasse from './ChampMotDePasse'
import Icone from './Icone'

export default function FormulaireConnexion({ email, onEmail, occupe, onOccupe, onMotDePasseOublie, onCreerCompte }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function connecter(evenement) {
    evenement.preventDefault()
    setErreur(null)
    setEnvoiEnCours(true)
    onOccupe(true)
    const message = await seConnecter(email, motDePasse)
    setEnvoiEnCours(false)
    onOccupe(false)
    if (message) setErreur(message)
  }

  return (
    <form className="pile" onSubmit={connecter} noValidate>
      <div>
        <h2 className="titre-accueil">Bon retour à table</h2>
        <p className="aide">Connecte-toi pour réserver ton repas de demain.</p>
      </div>

      <div className="champ">
        <label htmlFor="email-connexion">Adresse e-mail</label>
        <div className="champ-icone">
          <Icone nom="mail" />
          <input
            id="email-connexion"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="awa.kone@vatel.ci"
            value={email}
            onChange={(evenement) => onEmail(evenement.target.value)}
            required
          />
        </div>
      </div>

      <div className="pile-serree">
        <ChampMotDePasse
          id="mdp-connexion"
          libelle="Mot de passe"
          valeur={motDePasse}
          onChange={setMotDePasse}
          autoComplete="current-password"
        />
        <button type="button" className="lien-oubli" onClick={onMotDePasseOublie} disabled={occupe}>
          Mot de passe oublié ?
        </button>
      </div>

      {erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Connexion impossible</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      <button type="submit" className="btn" disabled={occupe || !email || !motDePasse}>
        {envoiEnCours ? 'Connexion…' : 'Se connecter'}
      </button>

      <p className="separateur-ou">Pas encore de compte ?</p>

      <button type="button" className="btn btn-secondaire" onClick={onCreerCompte} disabled={occupe}>
        Créer mon compte
      </button>
    </form>
  )
}
