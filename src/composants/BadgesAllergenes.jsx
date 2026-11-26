// Rangée de pastilles d'allergènes d'un plat ; celles qui touchent les allergies du profil passent en rouge.
import { trouverAllergene } from '../lib/allergenes'
import Icone from './Icone'

export default function BadgesAllergenes({ allergenes = [], allergiesProfil = [] }) {
  if (allergenes.length === 0) {
    return (
      <div className="allergenes">
        <span className="badge badge-neutre">Aucun déclaré</span>
      </div>
    )
  }

  return (
    <div className="allergenes" aria-label="Allergènes du plat">
      {allergenes.map((valeur) => {
        const allergene = trouverAllergene(valeur)
        const estARisque = allergiesProfil.includes(valeur)
        return (
          <span key={valeur} className={estARisque ? 'allergene allergene-danger' : 'allergene'}>
            <Icone nom={allergene.icone} /> {allergene.libelle}
          </span>
        )
      })}
    </div>
  )
}
