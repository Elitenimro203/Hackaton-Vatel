// Rangée défilante des créneaux de passage (11 h 50 à 12 h 50) : heure, attente prévue, badge Calme / Chargé, créneau complet grisé.
import { formaterAttente, formaterCreneau } from '../lib/formatage'
import '../file-attente.css'

const BADGES = {
  calme: { texte: '🍃 Calme', classe: 'creneau-badge creneau-badge-calme' },
  charge: { texte: '🔥 Chargé', classe: 'creneau-badge creneau-badge-charge' },
}

export default function ChoixCreneau({ creneaux, creneauChoisi, onChoisir }) {
  const choisi = creneaux.find((creneau) => creneau.creneau === creneauChoisi)

  return (
    <section className="choix-creneau" aria-labelledby="titre-creneau">
      <div className="espace-entre">
        <h2 id="titre-creneau" className="carte-titre">Ton heure de passage</h2>
        <span className="mention">Glisse →</span>
      </div>

      <div className="creneaux" role="radiogroup" aria-labelledby="titre-creneau">
        {creneaux.map((creneau) => {
          const badgeCreneau = creneau.complet ? null : BADGES[creneau.badge]
          const estChoisi = creneau.creneau === creneauChoisi
          return (
            <button
              key={creneau.creneau}
              type="button"
              role="radio"
              aria-checked={estChoisi}
              className={estChoisi ? 'creneau actif' : 'creneau'}
              disabled={creneau.complet}
              onClick={() => onChoisir(creneau.creneau)}
            >
              <span className={badgeCreneau ? badgeCreneau.classe : 'creneau-badge'}>{badgeCreneau?.texte}</span>
              <span className="creneau-case">
                <strong className="creneau-heure">{formaterCreneau(creneau.creneau)}</strong>
                <span className="creneau-attente">{creneau.complet ? 'Complet' : formaterAttente(creneau.attente)}</span>
              </span>
            </button>
          )
        })}
      </div>

      {choisi?.badge === 'calme' && <p className="phrase-creneau">Créneau calme : ton plat t’attend, chaud, sans file.</p>}
      {choisi && choisi.badge !== 'calme' && (
        <p className="mention">
          Attente prévue {formaterAttente(choisi.attente)} à {formaterCreneau(choisi.creneau)}. Un créneau 🍃 Calme t’évite la file.
        </p>
      )}
    </section>
  )
}
