// En-tête des écrans connectés : logo texte à gauche ; à droite, la pastille du prénom qui ouvre le panneau du compte (déconnexion).
import { useCallback, useState } from 'react'
import { initiales, prenomAffiche } from '../lib/formatage'
import FenetreCompte from './FenetreCompte'

export default function EnTete({ profil, afficherToast }) {
  const [compteOuvert, setCompteOuvert] = useState(false)
  const prenom = prenomAffiche(profil?.nom)
  const fermer = useCallback(() => setCompteOuvert(false), [])

  return (
    <header className="entete">
      <div className="logo">
        Canti<em>Juste</em>
        <span className="surtitre">Cantine Vatel · Vallon</span>
      </div>
      {profil && (
        <button
          type="button"
          className="entete-prenom entete-compte"
          onClick={() => setCompteOuvert(true)}
          aria-haspopup="dialog"
          aria-expanded={compteOuvert}
          aria-label={`Mon compte${prenom ? ` : ${prenom}` : ''}`}
        >
          <span className="entete-avatar" aria-hidden="true">{initiales(profil.nom)}</span>
          <span className="entete-prenom-texte">{prenom || 'Compte'}</span>
        </button>
      )}
      {compteOuvert && <FenetreCompte profil={profil} afficherToast={afficherToast} onFermer={fermer} />}
    </header>
  )
}
