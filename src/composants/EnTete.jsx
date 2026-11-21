// En-tête des écrans connectés : logo texte à gauche, prénom de la personne à droite.
export default function EnTete({ nom }) {
  const prenom = (nom || '').trim().split(' ')[0]

  return (
    <header className="entete">
      <div className="logo">
        Canti<em>Juste</em>
        <span className="surtitre">Cantine Vatel · Vallon</span>
      </div>
      {prenom && <span className="entete-prenom">👋 {prenom}</span>}
    </header>
  )
}
