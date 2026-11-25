// Onglet Ce qu'il mange du parent : repas réservés, servis et annulés de l'enfant choisi, du plus récent au plus ancien.
import { useCallback, useEffect, useState } from 'react'
import { chargerEnfants, prenomDe } from '../lib/enfants'
import { chargerRepasEnfant, statutAffiche } from '../lib/reservations'
import { dateDuJour, formaterDate } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import Vide from '../composants/Vide'
import Icone from '../composants/Icone'
import '../reservation.css'
import '../recharge.css'
import '../parent.css'

function LigneRepas({ repas }) {
  const statut = statutAffiche(repas)
  return (
    <li className="carte repas-enfant">
      <div className="vignette-plat">
        {repas.menus.photo_url ? (
          <img src={repas.menus.photo_url} alt={repas.menus.plat} loading="lazy" />
        ) : (
          <Icone nom="a-table" className="vignette-plat-icone" />
        )}
      </div>
      <div className="repas-enfant-texte">
        <p className="nom-plat nom-plat-ligne">{repas.menus.plat}</p>
        <p className="mention">
          {formaterDate(repas.menus.jour)}
          {repas.alternative ? ' · plat de remplacement' : ''}
        </p>
      </div>
      <span className={statut.classe}>{statut.libelle}</span>
    </li>
  )
}

export default function CeQuilMange({ onVoirEnfants }) {
  const [enfants, setEnfants] = useState([])
  const [idChoisi, setIdChoisi] = useState(null)
  const [repas, setRepas] = useState([])
  const [chargementEnfants, setChargementEnfants] = useState(true)
  const [chargementRepas, setChargementRepas] = useState(true)
  const [erreur, setErreur] = useState(null)

  const enfant = enfants.find((candidat) => candidat.id === idChoisi) || enfants[0]
  const idEnfant = enfant ? enfant.id : null

  const chargerLesEnfants = useCallback(async () => {
    const resultat = await chargerEnfants()
    setEnfants(resultat.enfants)
    setErreur(resultat.erreur)
    setChargementEnfants(false)
  }, [])

  const chargerLesRepas = useCallback(async () => {
    if (!idEnfant) return
    const resultat = await chargerRepasEnfant(idEnfant)
    setRepas(resultat.repas)
    setErreur(resultat.erreur)
    setChargementRepas(false)
  }, [idEnfant])

  useEffect(() => {
    chargerLesEnfants()
  }, [chargerLesEnfants])

  useEffect(() => {
    setChargementRepas(true)
    chargerLesRepas()
  }, [chargerLesRepas])

  // Un repas réservé ou servi à la cantine apparaît aussitôt
  useTempsReel(idEnfant ? 'reservations' : null, chargerLesRepas, idEnfant ? `eleve_id=eq.${idEnfant}` : null)

  const nombreServis = repas.filter((ligne) => ligne.statut === 'servie').length
  const nombreReserves = repas.filter((ligne) => ligne.statut === 'reservee' && ligne.menus.jour >= dateDuJour()).length
  const chargement = chargementEnfants || (enfant && chargementRepas)

  return (
    <section className="pile">
      <h1>Ce qu’il mange</h1>
      <p className="aide">
        {enfant ? `Les repas de ${prenomDe(enfant)}, du plus récent au plus ancien.` : 'Les repas réservés et servis à vos enfants.'}
      </p>

      {enfants.length > 1 && (
        <fieldset className="groupe-choix">
          <legend className="libelle-groupe">Quel enfant ?</legend>
          <div className="tuiles-3">
            {enfants.map((candidat) => (
              <label key={candidat.id} className="tuile-paiement">
                <input
                  type="radio"
                  name="enfant-repas"
                  value={candidat.id}
                  checked={candidat.id === idEnfant}
                  onChange={() => setIdChoisi(candidat.id)}
                />
                {prenomDe(candidat)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {chargement && (
        <div className="chargement" aria-label="Chargement des repas…">
          <div className="squelette" />
          <div className="squelette squelette-ligne" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger les repas</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && !enfant && (
        <Vide
          icone="enfants"
          titre="Aucun enfant lié pour l’instant"
          texte="Liez le compte élève de votre enfant pour suivre ce qu’il mange."
          libelleBouton="Lier mon enfant"
          onAction={onVoirEnfants}
        />
      )}

      {!chargement && !erreur && enfant && repas.length === 0 && (
        <Vide
          icone="a-table"
          titre="Aucun repas pour l’instant"
          texte={`Dès que ${prenomDe(enfant)} réservera un plat, il apparaîtra ici avec sa date.`}
        />
      )}

      {!chargement && !erreur && enfant && repas.length > 0 && (
        <>
          <div className="espace-entre">
            <span className="badge badge-succes"><Icone nom="a-table" />{nombreServis} servi{nombreServis > 1 ? 's' : ''}</span>
            <span className="badge badge-attention"><Icone nom="ticket" />{nombreReserves} à venir</span>
          </div>
          <ul className="liste">
            {repas.map((ligne) => (
              <LigneRepas key={ligne.id} repas={ligne} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
