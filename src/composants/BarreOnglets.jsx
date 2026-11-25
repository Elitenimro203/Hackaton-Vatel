// Barre d'onglets collée en bas de l'écran : un bouton par onglet, l'actif en safran.
import Icone from './Icone'
export default function BarreOnglets({ onglets, ongletActif, onChoisir }) {
  return (
    <nav className="onglets" aria-label="Navigation principale">
      {onglets.map((onglet) => {
        const estActif = onglet.id === ongletActif
        return (
          <button
            key={onglet.id}
            type="button"
            className={estActif ? 'onglet actif' : 'onglet'}
            aria-current={estActif ? 'page' : undefined}
            onClick={() => onChoisir(onglet.id)}
          >
            <Icone nom={onglet.icone} className="onglet-icone" />
            <span className="onglet-libelle">{onglet.libelle}</span>
          </button>
        )
      })}
    </nav>
  )
}
