// Liste « Les convives arrivent bientôt » : élève, plat, code de retrait, statut et bouton « Servi » par ligne.
import { formaterCodeRetrait } from '../lib/formatage'
import Vide from './Vide'
import Icone from './Icone'

// Statut technique → mot français et couleur de la pastille
const STATUTS = {
  reservee: { libelle: 'Réservé', classe: 'badge badge-attention' },
  servie: { libelle: 'Servi', classe: 'badge badge-succes' },
}

export default function ListeConvives({ commandes, peutServir, codeEnCours, onServir, onVoirMenus }) {
  const restant = commandes.filter((commande) => commande.statut === 'reservee').length

  return (
    <section className="carte liste-convives">
      <div>
        <h2 className="titre-bloc">Les convives arrivent bientôt</h2>
        <p className="aide">
          {peutServir
            ? `${restant} assiette${restant > 1 ? 's' : ''} encore à servir. Touche « Servi » quand l’assiette part.`
            : 'Le bouton « Servi » apparaît le jour du service.'}
        </p>
      </div>

      {commandes.length === 0 ? (
        <Vide
          icone="a-table"
          titre="Aucune réservation pour ce service"
          texte="Les élèves réservent jusqu’à la veille 18 h. Vérifie que le menu est en ligne."
          libelleBouton="Voir les menus"
          onAction={onVoirMenus}
        />
      ) : (
        <div>
          <div className="convive-entetes" aria-hidden="true">
            <span>Élève</span>
            <span>Plat</span>
            <span>Retrait</span>
            <span>Statut</span>
            <span />
          </div>
          <ul className="convives">
            {commandes.map((commande) => {
              const statut = STATUTS[commande.statut] || STATUTS.reservee
              const estServie = commande.statut === 'servie'
              const envoiEnCours = codeEnCours === commande.code_retrait
              return (
                <li key={commande.reservation_id} className="convive">
                  <strong className="convive-nom">{commande.nom || 'Élève sans nom'}</strong>
                  <span className="convive-plat">{commande.plat}</span>
                  <span className="code-retrait convive-code">{formaterCodeRetrait(commande.code_retrait)}</span>
                  <span className={statut.classe}>{statut.libelle}</span>
                  {peutServir && (
                    <button
                      type="button"
                      className={estServie ? 'btn btn-ligne btn-servi' : 'btn btn-secondaire btn-ligne'}
                      disabled={estServie || Boolean(codeEnCours)}
                      onClick={() => onServir(commande.code_retrait)}
                      aria-label={estServie ? `${commande.nom} déjà servi` : `Servir ${commande.nom}`}
                    >
                      {estServie && <Icone nom="coche" />}
                      {estServie ? 'Servi' : envoiEnCours ? '…' : 'Servi'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
