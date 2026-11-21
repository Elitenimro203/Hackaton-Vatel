// Carte « Note ce repas » : photo, plat, 5 gros boutons étoiles, mot facultatif pour la cuisine. Un avis déjà donné se modifie.
import { useState } from 'react'
import { LONGUEUR_MAX_MOT, noterRepas } from '../lib/avis'
import { formaterJourMoisLong } from '../lib/formatage'
import PhotoPlat from './PhotoPlat'
import '../avis.css'

const LIBELLES = ['Pas bon du tout', 'Bof', 'Correct', 'Bon', 'Excellent']

export default function NoterRepas({ reservation, avisExistant, onEnvoye, afficherToast }) {
  const { menus } = reservation
  const [etoiles, setEtoiles] = useState(avisExistant ? avisExistant.etoiles : 0)
  const [mot, setMot] = useState(avisExistant ? avisExistant.commentaire : '')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const dejaNote = Boolean(avisExistant)
  const inchange = dejaNote && etoiles === avisExistant.etoiles && mot.trim() === avisExistant.commentaire

  async function envoyer(evenement) {
    evenement.preventDefault()
    if (etoiles === 0) return
    setEnvoiEnCours(true)
    const erreur = await noterRepas(reservation.menu_id, etoiles, mot)
    setEnvoiEnCours(false)
    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast('Merci, la cuisine lit tout')
    onEnvoye()
  }

  return (
    <form className="carte avis-carte" onSubmit={envoyer}>
      <div className="avis-entete">
        <div className="avis-photo">
          <PhotoPlat adresse={menus.photo_url} nomPlat={menus.plat} />
        </div>
        <div className="avis-titre">
          <p className="nom-plat nom-plat-ligne">{menus.plat}</p>
          <p className="mention">Servi · {formaterJourMoisLong(menus.jour)}</p>
        </div>
      </div>

      <div className="champ">
        <span className="champ-libelle" id={`note-${reservation.id}`}>
          {dejaNote ? 'Ta note' : 'Note ce repas'}
        </span>
        <div className="etoiles avis-etoiles" role="radiogroup" aria-labelledby={`note-${reservation.id}`}>
          {[1, 2, 3, 4, 5].map((valeur) => (
            <button
              key={valeur}
              type="button"
              role="radio"
              aria-checked={etoiles === valeur}
              aria-label={`${valeur} étoile${valeur > 1 ? 's' : ''}`}
              className={valeur <= etoiles ? 'etoile etoile-active' : 'etoile'}
              onClick={() => setEtoiles(valeur)}
              disabled={envoiEnCours}
            >
              ★
            </button>
          ))}
        </div>
        {etoiles > 0 && <span className="mention">{LIBELLES[etoiles - 1]}</span>}
      </div>

      {etoiles > 0 && (
        <>
          <div className="champ">
            <label htmlFor={`mot-${reservation.id}`}>Un mot pour la cuisine ? (facultatif)</label>
            <textarea
              id={`mot-${reservation.id}`}
              className="avis-mot"
              rows={3}
              maxLength={LONGUEUR_MAX_MOT}
              value={mot}
              onChange={(evenement) => setMot(evenement.target.value)}
              placeholder="Ce que tu as aimé, ce qui peut changer…"
              disabled={envoiEnCours}
            />
            <span className="mention avis-compteur">
              {mot.length} / {LONGUEUR_MAX_MOT}
            </span>
          </div>
          <button type="submit" className="btn" disabled={envoiEnCours || inchange}>
            {envoiEnCours ? 'Envoi…' : dejaNote ? 'Mettre à jour mon avis' : 'Envoyer mon avis'}
          </button>
        </>
      )}
    </form>
  )
}
