// Profil alimentaire en une ligne (« Arachide · Kiwi · Sans gluten ») ; la toucher ouvre le formulaire dans un panneau du bas.
import { useCallback, useEffect, useState } from 'react'
import { resumerProfil } from '../lib/allergenes'
import ProfilAlimentaire from './ProfilAlimentaire'
import Icone from './Icone'
import '../allergies.css'

function FenetreProfilAlimentaire({ eleve, afficherToast, onEnregistre, onFermer, pourParent }) {
  const prenom = eleve.nom.trim().split(' ')[0]

  // Échap ferme le panneau
  useEffect(() => {
    function surTouche(evenement) {
      if (evenement.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="fenetre-bas pile fenetre-profil" role="dialog" aria-modal="true" aria-labelledby={`titre-profil-${eleve.id}`}>
        <div className="espace-entre">
          <span className="surtitre">{pourParent ? `Profil de ${prenom}` : 'Ton profil'}</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" />
          </button>
        </div>
        <h2 id={`titre-profil-${eleve.id}`}>Allergies et régime</h2>
        <ProfilAlimentaire eleve={eleve} afficherToast={afficherToast} onEnregistre={onEnregistre} onFermer={onFermer} pourParent={pourParent} />
      </div>
    </div>
  )
}

export default function CarteProfilAlimentaire({ eleve, afficherToast, onEnregistre, pourParent = false }) {
  const [ouvert, setOuvert] = useState(false)
  const fermer = useCallback(() => setOuvert(false), [])
  const resume = resumerProfil(eleve)
  const aSurveiller = (eleve.allergies || []).length > 0 || Boolean(eleve.autre_allergie)

  return (
    <>
      <button type="button" className="repli repli-carte repli-titre resume-profil" onClick={() => setOuvert(true)} aria-haspopup="dialog">
        <Icone nom={aSurveiller ? 'alerte' : 'bouclier'} className={aSurveiller ? 'icone-alerte' : 'icone-feuille'} />
        <span>
          <span className="sous-titre">Allergies et régime</span>
          <span className="mention">{resume || 'Rien de déclaré'}</span>
        </span>
        <span className="repli-action">Modifier</span>
      </button>
      {ouvert && (
        <FenetreProfilAlimentaire eleve={eleve} afficherToast={afficherToast} onEnregistre={onEnregistre} onFermer={fermer} pourParent={pourParent} />
      )}
    </>
  )
}
