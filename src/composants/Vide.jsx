// État vide soigné d'une liste : grosse icône dans une bulle safran, titre, phrase et bouton d'action facultatif.
import Icone from './Icone'

export default function Vide({ icone = 'a-table', titre, texte, libelleBouton, onAction }) {
  return (
    <div className="vide">
      <span className="vide-icone">
        <Icone nom={icone} />
      </span>
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
