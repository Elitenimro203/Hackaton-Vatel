// Carte d'un thème : libellé, nombre d'avis, barre de sentiment, évolution des avis négatifs et un vrai extrait. Un clic ouvre la liste des avis.
import { evolutionTheme, partPourcent } from '../lib/statsInsights'
import BarreSentiment from './BarreSentiment'

export default function CarteTheme({ theme, onOuvrir }) {
  const total = theme.positif + theme.neutre + theme.negatif
  const evolution = evolutionTheme(theme)

  return (
    <button type="button" className="carte carte-theme" onClick={() => onOuvrir(theme)} aria-haspopup="dialog">
      <span className="carte-theme-entete">
        <span className="carte-theme-titre">{theme.libelle}</span>
        <span className="carte-theme-nombre">
          {theme.avis} <small>avis</small>
        </span>
      </span>

      <BarreSentiment positif={theme.positif} neutre={theme.neutre} negatif={theme.negatif} />

      <span className="carte-theme-pied">
        <span className="mention">
          {partPourcent(theme.positif, total)} % positif · {partPourcent(theme.negatif, total)} % négatif
        </span>
        <span className={evolution.hausse ? 'evolution evolution-hausse' : 'evolution'} title={evolution.titre}>
          {evolution.texte}
        </span>
      </span>

      {theme.extrait && (
        <span className="carte-theme-extrait">
          « {theme.extrait} »
          <span className="badge badge-neutre">{theme.plat_extrait}</span>
        </span>
      )}
    </button>
  )
}
