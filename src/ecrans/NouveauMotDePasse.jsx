// Écran ouvert depuis le lien « mot de passe oublié » : on choisit un nouveau mot de passe, puis on arrive dans son espace.
import { useState } from 'react'
import { changerMotDePasse } from '../lib/authentification'
import ChampMotDePasse from '../composants/ChampMotDePasse'
import Icone from '../composants/Icone'

export default function NouveauMotDePasse({ afficherToast, onTermine }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function enregistrer(evenement) {
    evenement.preventDefault()
    setErreur(null)
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setEnvoiEnCours(true)
    const message = await changerMotDePasse(motDePasse)
    setEnvoiEnCours(false)
    if (message) {
      setErreur(message)
      return
    }
    afficherToast('Mot de passe changé. Bon appétit !')
    onTermine()
  }

  return (
    <main className="page">
      <header className="entete">
        <div className="logo">
          Canti<em>Juste</em>
          <span className="surtitre">Cantine Vatel · Vallon</span>
        </div>
      </header>

      <section className="carte-connexion carte-connexion-seule">
        <form className="pile" onSubmit={enregistrer} noValidate>
          <span className="envoi-reussi-icone">
            <Icone nom="cle" />
          </span>
          <div>
            <h1 className="titre-accueil">Nouveau mot de passe</h1>
            <p className="aide">Choisis-en un que tu n’utilises nulle part ailleurs.</p>
          </div>

          <ChampMotDePasse
            id="nouveau-mdp"
            libelle="Nouveau mot de passe"
            valeur={motDePasse}
            onChange={setMotDePasse}
            autoComplete="new-password"
            aide="8 caractères minimum."
          />
          <ChampMotDePasse
            id="confirmation-mdp"
            libelle="Confirme-le"
            valeur={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
          />

          {erreur && (
            <div className="alerte alerte-erreur" role="alert">
              <Icone nom="alerte" />
              <div>
                <strong>Mot de passe non changé</strong>
                <p>{erreur}</p>
              </div>
            </div>
          )}

          <button type="submit" className="btn" disabled={envoiEnCours || !motDePasse || !confirmation}>
            {envoiEnCours ? 'Enregistrement…' : 'Enregistrer et continuer'}
          </button>
        </form>
      </section>
    </main>
  )
}
