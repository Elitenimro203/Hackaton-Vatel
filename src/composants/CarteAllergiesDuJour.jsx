// Carte rouge « À surveiller » des Commandes du jour : convives avec allergies, régime ou autre allergie, et plats à risque.
import { trouverAllergene } from '../lib/allergenes'
import { trouverRegime } from '../lib/regimes'
import { formaterCodeRetrait, formaterDate } from '../lib/formatage'
import Icone from './Icone'
import '../allergies.css'

function estARisque(ligne) {
  return ligne.risques.length > 0 || Boolean(ligne.conflit_regime)
}

function phraseResume(lignes) {
  if (lignes.length === 0) return 'Aucun convive avec allergie ou régime n’a réservé pour ce service.'
  const nombreARisque = lignes.filter(estARisque).length
  const pluriel = lignes.length > 1 ? 's' : ''
  return `${lignes.length} convive${pluriel} à surveiller, dont ${nombreARisque} avec un plat à risque.`
}

export default function CarteAllergiesDuJour({ lignes, jour, estAujourdhui }) {
  return (
    <section className="carte-alerte pile">
      <div>
        <h2><Icone nom="alerte" /> À surveiller {estAujourdhui ? 'aujourd’hui' : formaterDate(jour)}</h2>
        <p className="aide">{phraseResume(lignes)}</p>
      </div>

      {lignes.length > 0 && (
        <ul className="liste-allergies">
          {lignes.map((ligne) => (
            <li key={ligne.reservation_id} className="carte-ligne ligne-allergie">
              <div>
                <strong>{ligne.nom || 'Élève sans nom'}</strong>
                <p className="mention">
                  {ligne.plat}
                  {ligne.alternative ? ' (remplacement)' : ''} · {formaterCodeRetrait(ligne.code_retrait)}
                </p>
                {ligne.risques.length > 0 && (
                  <span className="badge badge-erreur"><Icone nom="alerte" />Plat à risque, réservé quand même</span>
                )}
                {ligne.risques.length === 0 && ligne.conflit_regime && (
                  <span className="badge badge-erreur"><Icone nom="alerte" />{ligne.conflit_regime}</span>
                )}
                {ligne.autre_allergie && (
                  <p className="mention texte-alerte">Autre allergie : {ligne.autre_allergie}</p>
                )}
              </div>
              <div className="allergenes allergenes-droite">
                {ligne.regime !== 'aucun' && (
                  <span className={ligne.conflit_regime ? 'pastille pastille-danger' : 'allergene'}>
                    <Icone nom={trouverRegime(ligne.regime).icone} />{trouverRegime(ligne.regime).libelle}
                  </span>
                )}
                {ligne.allergies.map((valeur) => {
                  const allergene = trouverAllergene(valeur)
                  const allergeneARisque = ligne.risques.includes(valeur)
                  return (
                    <span key={valeur} className={allergeneARisque ? 'pastille pastille-danger' : 'allergene'}>
                      <Icone nom={allergene.icone} />{allergene.libelle}
                    </span>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mention liste-allergies-pied">Vérifie le code, les allergies et le régime avant de servir.</p>
    </section>
  )
}
