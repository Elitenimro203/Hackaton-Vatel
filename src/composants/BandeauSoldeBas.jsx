// Bandeau safran « Solde bas » en haut de l'écran (solde sous 2 000 F), avec le bouton « Recharger maintenant ».
import '../parent.css'

export default function BandeauSoldeBas({ titre, detail, onRecharger }) {
  return (
    <div className="bandeau-solde-bas" role="status">
      <span className="bandeau-solde-bas-emoji" aria-hidden="true">🔔</span>
      <div className="bandeau-solde-bas-texte">
        <strong>{titre}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="btn-bandeau" onClick={onRecharger}>
        Recharger maintenant
      </button>
    </div>
  )
}
