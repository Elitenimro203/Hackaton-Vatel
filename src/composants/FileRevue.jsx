// File « À revoir (N) » : l'humain tranche les codages douteux de l'IA. Valider, Corriger (thème + sentiment) ou Ignorer.
import { useState } from 'react'
import { reviserCodage } from '../lib/insights'
import { SENTIMENTS, ignorerCodage, libelleSentiment } from '../lib/statsInsights'
import { formaterDateCourte } from '../lib/formatage'
import Vide from './Vide'
import Icone from './Icone'

function CarteRevue({ codage, themes, afficherToast, onTranche }) {
  const [correction, setCorrection] = useState(false)
  const [theme, setTheme] = useState(codage.theme)
  const [sentiment, setSentiment] = useState(codage.sentiment)
  const [enCours, setEnCours] = useState(false)

  async function agir(action, message) {
    setEnCours(true)
    const erreur = await action()
    setEnCours(false)
    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast(message)
    onTranche()
  }

  const valider = () => agir(() => reviserCodage(codage.codage_id, codage.theme, codage.sentiment), 'Codage validé.')
  const corriger = () => agir(() => reviserCodage(codage.codage_id, theme, sentiment), 'Codage corrigé.')
  const ignorer = () => agir(() => ignorerCodage(codage.codage_id), 'Codage ignoré.')

  return (
    <li className="carte-revue">
      <div className="avis-theme-tete">
        <span className="avis-etoiles" role="img" aria-label={`${codage.etoiles} étoiles sur 5`}>
          {'★'.repeat(codage.etoiles)}
          <span className="avis-etoiles-vides">{'★'.repeat(5 - codage.etoiles)}</span>
        </span>
        <span className="mention">
          {codage.plat} · {formaterDateCourte(codage.cree_le.slice(0, 10))}
        </span>
      </div>
      <p className="avis-theme-texte">{codage.commentaire || 'Pas de commentaire.'}</p>

      <p className="proposition">
        <span className="surtitre">Proposition {codage.source === 'ia' ? 'de l’IA' : 'des mots-clés'}</span>
        <span className="badge badge-attention">
          {codage.theme_libelle} · {libelleSentiment(codage.sentiment)} · {Math.round(Number(codage.confiance) * 100)} %
        </span>
      </p>

      {correction ? (
        <div className="revue-correction">
          <div className="champ">
            <label htmlFor={`theme-${codage.codage_id}`}>Thème</label>
            <select id={`theme-${codage.codage_id}`} value={theme} onChange={(evenement) => setTheme(evenement.target.value)} disabled={enCours}>
              {themes.map((option) => (
                <option key={option.code} value={option.code}>{option.libelle}</option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor={`sentiment-${codage.codage_id}`}>Sentiment</label>
            <select id={`sentiment-${codage.codage_id}`} value={sentiment} onChange={(evenement) => setSentiment(evenement.target.value)} disabled={enCours}>
              {SENTIMENTS.map((option) => (
                <option key={option.code} value={option.code}>{option.libelle}</option>
              ))}
            </select>
          </div>
          <div className="revue-actions">
            <button type="button" className="btn" onClick={corriger} disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer la correction'}
            </button>
            <button type="button" className="btn btn-discret" onClick={() => setCorrection(false)} disabled={enCours}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="revue-actions">
          <button type="button" className="btn" onClick={valider} disabled={enCours}>
            <span className="avec-icone">
                <Icone nom="coche" />
                Valider
              </span>
          </button>
          <button type="button" className="btn btn-secondaire" onClick={() => setCorrection(true)} disabled={enCours}>
            Corriger
          </button>
          <button type="button" className="btn btn-discret" onClick={ignorer} disabled={enCours}>
            Ignorer
          </button>
        </div>
      )}
    </li>
  )
}

const PAR_PAGE = 5

export default function FileRevue({ codages, total, themes, accord, afficherToast, onTranche }) {
  const [affiches, setAffiches] = useState(PAR_PAGE)
  const visibles = codages.slice(0, affiches)

  return (
    <section className="carte pilotage-carte file-revue" aria-labelledby="titre-revue">
      <h2 id="titre-revue" className="titre-pilotage">À revoir ({total})</h2>
      <p className="aide">
        Taux d’accord IA / humain : <strong>{accord === null || accord === undefined ? '—' : `${accord} %`}</strong>
        <span className="mention revue-accord"> (validés ÷ validés + corrigés)</span>
      </p>

      {codages.length === 0 ? (
        <Vide icone="coche-ronde" titre="Rien à revoir." texte="Tous les codages sont sûrs ou déjà tranchés." />
      ) : (
        <>
          <ul className="revue-liste">
            {visibles.map((codage) => (
              <CarteRevue key={codage.codage_id} codage={codage} themes={themes} afficherToast={afficherToast} onTranche={onTranche} />
            ))}
          </ul>
          {codages.length > affiches && (
            <button type="button" className="btn btn-secondaire revue-plus" onClick={() => setAffiches(affiches + PAR_PAGE)}>
              Voir les {Math.min(PAR_PAGE, codages.length - affiches)} suivants
            </button>
          )}
          <p className="mention">
            {visibles.length} sur {total} affichés, les moins sûrs d’abord.
          </p>
        </>
      )}
    </section>
  )
}
