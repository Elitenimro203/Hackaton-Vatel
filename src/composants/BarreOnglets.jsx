// Barre d'onglets collée en bas de l'écran : un bouton par onglet, l'actif en safran.
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
            <span className="onglet-icone" aria-hidden="true">{onglet.icone}</span>
            <span className="onglet-libelle">{onglet.libelle}</span>
          </button>
        )
      })}
    </nav>
  )
}
