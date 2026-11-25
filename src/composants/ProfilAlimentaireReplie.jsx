// Profil alimentaire replié : une ligne de résumé (« Arachide · Pas de régime ») qui s'ouvre sur le formulaire complet.
import { resumerProfil } from '../lib/allergenes'
import ProfilAlimentaire from './ProfilAlimentaire'
import Icone from './Icone'

export default function ProfilAlimentaireReplie({ eleve, afficherToast, onEnregistre, pourParent = false }) {
  const resume = resumerProfil(eleve)
  const aSurveiller = (eleve.allergies || []).length > 0 || Boolean(eleve.autre_allergie)

  return (
    <details className="repli repli-carte">
      <summary className="repli-titre">
        <Icone nom={aSurveiller ? 'alerte' : 'bouclier'} className={aSurveiller ? 'icone-alerte' : 'icone-feuille'} />
        <span>
          <span className="sous-titre">Allergies et régime</span>
          <span className="mention">{resume || 'Rien de déclaré'}</span>
        </span>
        <span className="repli-action">Modifier</span>
      </summary>
      <div className="repli-contenu">
        <ProfilAlimentaire eleve={eleve} afficherToast={afficherToast} onEnregistre={onEnregistre} pourParent={pourParent} />
      </div>
    </details>
  )
}
