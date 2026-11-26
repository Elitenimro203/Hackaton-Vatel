// Panneau du compte, ouvert depuis la pastille du prénom en haut à droite : initiales, nom, profil, e-mail et « Se déconnecter ».
import { useEffect, useState } from 'react'
import { seDeconnecter } from '../lib/authentification'
import { initiales, libelleDuProfil } from '../lib/formatage'
import Icone from './Icone'

export default function FenetreCompte({ profil, afficherToast, onFermer }) {
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  // Échap ferme le panneau
  useEffect(() => {
    function surTouche(evenement) {
      if (evenement.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  async function deconnecter() {
    setEnvoiEnCours(true)
    const erreur = await seDeconnecter()
    if (erreur) {
      afficherToast(erreur, 'erreur')
      setEnvoiEnCours(false)
    }
  }

  // Toucher le fond flouté ferme aussi le panneau
  function surVoile(evenement) {
    if (evenement.target === evenement.currentTarget) onFermer()
  }

  return (
    <div className="voile" onClick={surVoile}>
      <div className="fenetre-bas fenetre-compte" role="dialog" aria-modal="true" aria-labelledby="titre-compte">
        <div className="compte-entete">
          <span className="compte-avatar compte-avatar-grand" aria-hidden="true">{initiales(profil.nom)}</span>
          <h2 id="titre-compte" className="compte-nom-grand">{profil.nom || 'Mon compte'}</h2>
          <span className="mention compte-detail">{libelleDuProfil(profil)} · {profil.email}</span>
        </div>

        <div className="carte compte">
          <button type="button" className="compte-deconnexion" onClick={deconnecter} disabled={envoiEnCours}>
            <Icone nom="deconnexion" className="icone-alerte" />
            {envoiEnCours ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>

        <button type="button" className="btn btn-secondaire" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  )
}
