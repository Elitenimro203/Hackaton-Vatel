// Mot de passe oublié : on envoie un lien par e-mail, puis on dit quoi faire ensuite, sans révéler si le compte existe.
import { useState } from 'react'
import { envoyerLienMotDePasse } from '../lib/authentification'
import Icone from './Icone'

export default function FormulaireMotDePasseOublie({ email, onEmail, onRetour }) {
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [adresseEnvoyee, setAdresseEnvoyee] = useState(null)

  async function envoyer(evenement) {
    evenement.preventDefault()
    setErreur(null)
    setEnvoiEnCours(true)
    const message = await envoyerLienMotDePasse(email)
    setEnvoiEnCours(false)
    if (message) setErreur(message)
    else setAdresseEnvoyee(email.trim().toLowerCase())
  }

  if (adresseEnvoyee) {
    return (
      <div className="pile envoi-reussi" role="status">
        <span className="envoi-reussi-icone">
          <Icone nom="mail" />
        </span>
        <div>
          <h2 className="titre-accueil">Regarde ta boîte mail</h2>
          <p className="aide">
            Si un compte existe avec <strong className="texte-creme">{adresseEnvoyee}</strong>, un lien vient d’y partir. Ouvre-le sur ce
            téléphone pour choisir un nouveau mot de passe.
          </p>
        </div>
        <p className="mention">Rien reçu après 2 minutes ? Regarde dans les courriers indésirables, ou demande un nouveau lien.</p>
        <button type="button" className="btn btn-secondaire" onClick={onRetour}>
          Revenir à la connexion
        </button>
        <button type="button" className="btn btn-discret" onClick={() => setAdresseEnvoyee(null)}>
          Renvoyer un lien
        </button>
      </div>
    )
  }

  return (
    <form className="pile" onSubmit={envoyer} noValidate>
      <button type="button" className="lien-retour" onClick={onRetour}>
        <Icone nom="retour" />
        Connexion
      </button>

      <div>
        <h2 className="titre-accueil">Mot de passe oublié ?</h2>
        <p className="aide">Ça arrive. Donne ton e-mail : on t’envoie un lien pour en choisir un nouveau.</p>
      </div>

      <div className="champ">
        <label htmlFor="email-oubli">Adresse e-mail</label>
        <div className="champ-icone">
          <Icone nom="mail" />
          <input
            id="email-oubli"
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

      {erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Envoi impossible</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      <button type="submit" className="btn" disabled={envoiEnCours || !email}>
        {envoiEnCours ? 'Envoi…' : 'Recevoir le lien'}
      </button>
    </form>
  )
}
