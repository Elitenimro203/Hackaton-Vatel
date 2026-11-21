// Fenêtre « Les avis d'un thème » : liste des avis comptés dans ce thème sur la période, les plus récents d'abord.
import { useEffect, useState } from 'react'
import { chargerAvisDuTheme, libelleSentiment } from '../lib/statsInsights'
import { formaterDateCourte } from '../lib/formatage'
import '../insights.css'
import '../allergies.css'

const CLASSES_SENTIMENT = { positif: 'badge badge-succes', neutre: 'badge badge-neutre', negatif: 'badge badge-erreur' }

export default function FenetreAvisTheme({ theme, debut, fin, onFermer }) {
  const [avis, setAvis] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let actif = true
    chargerAvisDuTheme(theme.code, debut, fin).then((resultat) => {
      if (!actif) return
      setAvis(resultat.avis)
      setErreur(resultat.erreur)
      setChargement(false)
    })
    return () => {
      actif = false
    }
  }, [theme.code, debut, fin])

  return (
    <div className="voile">
      <div className="fenetre-bas pile fenetre-insights" role="dialog" aria-modal="true" aria-labelledby="titre-avis-theme">
        <div className="espace-entre">
          <span className="surtitre">{theme.avis} avis</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>
        <h2 id="titre-avis-theme">{theme.libelle}</h2>

        {chargement && <div className="squelette" />}
        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}
        {!chargement && !erreur && avis.length === 0 && <p className="aide">Aucun avis pour ce thème sur la période.</p>}

        <ul className="liste-avis-theme">
          {avis.map((unAvis) => (
            <li key={`${unAvis.avis_id}-${unAvis.sentiment}`} className="avis-theme">
              <div className="avis-theme-tete">
                <span className="avis-etoiles" role="img" aria-label={`${unAvis.etoiles} étoiles sur 5`}>
                  {'★'.repeat(unAvis.etoiles)}
                  <span className="avis-etoiles-vides">{'★'.repeat(5 - unAvis.etoiles)}</span>
                </span>
                <span className={CLASSES_SENTIMENT[unAvis.sentiment]}>{libelleSentiment(unAvis.sentiment)}</span>
              </div>
              <p className="avis-theme-texte">{unAvis.commentaire || 'Pas de commentaire.'}</p>
              <p className="mention">
                {unAvis.plat} · {formaterDateCourte(unAvis.cree_le.slice(0, 10))}
              </p>
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn-secondaire" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  )
}
