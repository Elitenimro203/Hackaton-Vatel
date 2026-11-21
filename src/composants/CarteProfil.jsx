// Carte du compte connecté (nom, e-mail, rôle) avec le bouton de déconnexion.
import { useState } from 'react'
import { seDeconnecter } from '../lib/authentification'

const LIBELLES_PROFIL = {
  eleve: 'Élève',
  employe: 'Employé',
  parent: 'Parent',
  admin: 'Admin',
}

export default function CarteProfil({ profil, afficherToast }) {
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const cleProfil = profil.role === 'eleve' ? profil.type_usager : profil.role

  async function deconnecter() {
    setEnvoiEnCours(true)
    const erreur = await seDeconnecter()
    if (erreur) {
      afficherToast(erreur, 'erreur')
      setEnvoiEnCours(false)
    }
  }

  return (
    <section className="carte pile">
      <div className="espace-entre">
        <h2 className="carte-titre">{profil.nom || 'Mon compte'}</h2>
        <span className="badge badge-info">{LIBELLES_PROFIL[cleProfil]}</span>
      </div>
      <p className="mention">{profil.email}</p>
      <button type="button" className="btn btn-danger" onClick={deconnecter} disabled={envoiEnCours}>
        {envoiEnCours ? 'Déconnexion…' : '🚪 Se déconnecter'}
      </button>
    </section>
  )
}
