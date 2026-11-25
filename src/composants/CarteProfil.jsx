// Carte du compte connecté : initiales, nom, profil et e-mail sur une ligne, puis « Se déconnecter » en ligne discrète.
import { useState } from 'react'
import { seDeconnecter } from '../lib/authentification'
import Icone from './Icone'

const LIBELLES_PROFIL = {
  eleve: 'Élève',
  employe: 'Employé',
  parent: 'Parent',
  admin: 'Admin',
}

// « Awa Koné » → « AK » (une lettre si un seul mot)
function initiales(nom) {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean)
  return mots.slice(0, 2).map((mot) => mot.charAt(0).toUpperCase()).join('') || '?'
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
    <section className="carte compte">
      <div className="compte-ligne">
        <span className="compte-avatar" aria-hidden="true">{initiales(profil.nom)}</span>
        <span className="compte-texte">
          <strong className="compte-nom">{profil.nom || 'Mon compte'}</strong>
          <span className="mention compte-detail">{LIBELLES_PROFIL[cleProfil]} · {profil.email}</span>
        </span>
      </div>
      <button type="button" className="compte-deconnexion" onClick={deconnecter} disabled={envoiEnCours}>
        <Icone nom="deconnexion" className="icone-alerte" />
        {envoiEnCours ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </section>
  )
}
