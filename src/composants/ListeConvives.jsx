// Liste « Les convives arrivent bientôt » : ceux à servir d'abord, les 6 premiers visibles, élève, plat, code, statut et bouton « Servi ».
import { useState } from 'react'
import { formaterCodeRetrait } from '../lib/formatage'
import Vide from './Vide'
import Icone from './Icone'

// Statut technique → mot français et couleur de la pastille
const STATUTS = {
  reservee: { libelle: 'Réservé', classe: 'badge badge-attention' },
  servie: { libelle: 'Servi', classe: 'badge badge-succes' },
}

const NOMBRE_VISIBLE = 6

// titre et aide remplacent les textes par défaut ; sans onVoirMenus, l'état vide n'a pas de bouton (rôle cantine)
export default function ListeConvives({ commandes, peutServir, codeEnCours, onServir, onVoirMenus, titre, aide }) {
  const [toutVoir, setToutVoir] = useState(false)
  const restant = commandes.filter((commande) => commande.statut === 'reservee').length
  // Les assiettes encore à servir passent devant celles déjà parties
  const triees = [...commandes].sort((a, b) => Number(a.statut === 'servie') - Number(b.statut === 'servie'))
  const visibles = toutVoir ? triees : triees.slice(0, NOMBRE_VISIBLE)
  const cachees = triees.length - visibles.length

  return (
    <section className="carte liste-convives">
      <div>
        <h2 className="titre-bloc">{titre || 'Les convives arrivent bientôt'}</h2>
        <p className="aide">
          {aide ||
            (peutServir
              ? `${restant} assiette${restant > 1 ? 's' : ''} encore à servir. Touche « Servi » quand l’assiette part.`
              : 'Le bouton « Servi » apparaît le jour du service.')}
        </p>
      </div>

      {commandes.length === 0 ? (
        <Vide
          icone="a-table"
          titre="Aucune réservation pour ce service"
          texte="Les élèves réservent jusqu’à la veille 18 h. Vérifie que le menu est en ligne."
          libelleBouton={onVoirMenus ? 'Voir les menus' : undefined}
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
            {visibles.map((commande) => {
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
          {cachees > 0 && (
            <button type="button" className="btn btn-discret" onClick={() => setToutVoir(true)}>
              Voir les {cachees} autres convives
            </button>
          )}
        </div>
      )}
    </section>
  )
}
