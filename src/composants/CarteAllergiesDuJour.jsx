// Carte rouge « Allergies à surveiller » des Commandes du jour : élèves allergiques du service et plats à risque.
import { trouverAllergene } from '../lib/allergenes'
import { formaterCodeRetrait, formaterDate } from '../lib/formatage'
import '../allergies.css'

export default function CarteAllergiesDuJour({ lignes, jour, estAujourdhui }) {
  const nombreARisque = lignes.filter((ligne) => ligne.risques.length > 0).length

  return (
    <section className="carte-alerte pile">
      <div>
        <h2>⚠ Allergies à surveiller {estAujourdhui ? 'aujourd’hui' : formaterDate(jour)}</h2>
        <p className="aide">
          {lignes.length === 0
            ? 'Aucun élève allergique n’a réservé pour ce service.'
            : `${lignes.length} élève${lignes.length > 1 ? 's' : ''} allergique${lignes.length > 1 ? 's' : ''}, dont ${nombreARisque} avec un plat à risque.`}
        </p>
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
                  <span className="badge badge-erreur">⚠ Plat à risque, réservé quand même</span>
                )}
              </div>
              <div className="allergenes allergenes-droite">
                {ligne.allergies.map((valeur) => {
                  const allergene = trouverAllergene(valeur)
                  const estARisque = ligne.risques.includes(valeur)
                  return (
                    <span key={valeur} className={estARisque ? 'pastille pastille-danger' : 'allergene'}>
                      {allergene.emoji} {allergene.libelle}
                    </span>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mention liste-allergies-pied">Vérifie le code et les allergies avant de servir.</p>
    </section>
  )
}
