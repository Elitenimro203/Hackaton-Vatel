// En-tête des écrans connectés : logo texte à gauche, prénom de la personne à droite.
import { prenomAffiche } from '../lib/formatage'
import Icone from './Icone'

export default function EnTete({ nom }) {
  const prenom = prenomAffiche(nom)

  return (
    <header className="entete">
      <div className="logo">
        Canti<em>Juste</em>
        <span className="surtitre">Cantine Vatel · Vallon</span>
      </div>
      {prenom && (
        <span className="entete-prenom">
          <Icone nom="profil" className="icone-safran" />
          {prenom}
        </span>
      )}
    </header>
  )
}
