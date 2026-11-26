// Création de compte : nom, e-mail, mot de passe et profil (Élève, Employé ou Parent, jamais admin).
import { useState } from 'react'
import { creerCompte } from '../lib/authentification'
import { formaterMontant } from '../lib/formatage'
import Icone from '../composants/Icone'

const PROFILS = [
  { valeur: 'eleve', titre: 'Élève', detail: `${formaterMontant(1000)} / repas` },
  { valeur: 'employe', titre: 'Employé', detail: `${formaterMontant(1500)} / repas` },
  { valeur: 'parent', titre: 'Parent', detail: 'Suivi & recharge' },
]

export default function Inscription({ onRetour, afficherToast }) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [profil, setProfil] = useState('eleve')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function inscrire(evenement) {
    evenement.preventDefault()
    setErreur(null)
    setEnvoiEnCours(true)
    const resultat = await creerCompte({ nom, email, motDePasse, profil })
    setEnvoiEnCours(false)

    if (resultat.erreur) {
      setErreur(resultat.erreur)
    } else if (resultat.connecte) {
      afficherToast(`Bienvenue, ${nom.trim().split(' ')[0]} !`)
    } else {
      afficherToast('Compte créé. Confirme ton e-mail, puis connecte-toi.')
      onRetour()
    }
  }

  return (
    <main className="page">
      <header className="entete">
        <button type="button" className="btn-retour" onClick={onRetour} aria-label="Retour à la connexion">
          <Icone nom="retour" />
        </button>
        <div className="logo">
          Canti<em>Juste</em>
        </div>
      </header>

      <div>
        <h1>Ta place à table.</h1>
        <p className="aide">Un compte, des repas qui te ressemblent.</p>
      </div>

      <form className="pile" onSubmit={inscrire} noValidate>
        <div className="champ">
          <label htmlFor="nom-inscription">Ton nom complet</label>
          <input
            id="nom-inscription"
            type="text"
            autoComplete="name"
            placeholder="Awa Koné"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="email-inscription">Ton adresse e-mail</label>
          <input
            id="email-inscription"
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
          <label htmlFor="mdp-inscription">Ton mot de passe</label>
          <input
            id="mdp-inscription"
            type="password"
            autoComplete="new-password"
            placeholder="8 caractères minimum"
            minLength={8}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <span className="champ-libelle" id="titre-profil">Tu es…</span>
          <div className="choix-grille choix-grille-3" role="radiogroup" aria-labelledby="titre-profil">
            {PROFILS.map((option) => (
              <label key={option.valeur} className="choix choix-safran">
                <input
                  type="radio"
                  name="profil"
                  value={option.valeur}
                  checked={profil === option.valeur}
                  onChange={() => setProfil(option.valeur)}
                />
                <span className={profil === option.valeur ? 'texte-safran' : undefined}>{option.titre}</span>
                <span className="choix-detail">{option.detail}</span>
              </label>
            ))}
          </div>
        </div>

        {erreur && (
          <div className="alerte alerte-erreur" role="alert">
            <strong>Inscription impossible</strong>
            <p>{erreur}</p>
          </div>
        )}

        <button type="submit" className="btn" disabled={envoiEnCours || !nom || !email || !motDePasse}>
          {envoiEnCours ? 'Création…' : 'Créer mon compte'}
        </button>
        <p className="mention centre">
          En continuant, tu acceptes les conditions d’utilisation et la politique de confidentialité.
        </p>
      </form>
    </main>
  )
}
