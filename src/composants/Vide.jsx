// État vide soigné d'une liste : gros emoji, titre, phrase et bouton d'action facultatif.
export default function Vide({ emoji = '🍽️', titre, texte, libelleBouton, onAction }) {
  return (
    <div className="vide">
      <span className="vide-emoji" aria-hidden="true">{emoji}</span>
      <h3 className="vide-titre">{titre}</h3>
      {texte && <p className="vide-texte">{texte}</p>}
      {libelleBouton && onAction && (
        <button type="button" className="btn btn-secondaire" onClick={onAction}>
          {libelleBouton}
        </button>
      )}
    </div>
  )
}
 