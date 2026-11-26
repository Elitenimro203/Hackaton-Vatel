// Section « Recette » du formulaire des menus : les ingrédients du plat et la quantité par repas (sert à calculer les besoins et à déduire le stock).
import Icone from './Icone'
import '../allergies.css'
import '../stocks.css'

// lignes : [{ ingredient_id, quantite }] ; ingredients : [{ id, nom, unite }] ; onChange reçoit la nouvelle liste
export default function SectionRecette({ lignes, ingredients, onChange }) {
  const dejaChoisis = new Set(lignes.map((ligne) => String(ligne.ingredient_id)))

  function modifierLigne(position, changements) {
    onChange(lignes.map((ligne, autre) => (autre === position ? { ...ligne, ...changements } : ligne)))
  }

  function ajouterLigne() {
    const libre = ingredients.find((ingredient) => !dejaChoisis.has(String(ingredient.id)))
    if (libre) onChange([...lignes, { ingredient_id: libre.id, quantite: '' }])
  }

  function unite(idIngredient) {
    return ingredients.find((ingredient) => String(ingredient.id) === String(idIngredient))?.unite || ''
  }

  return (
    <div className="pile section-recette">
      <h3 className="sous-titre">Recette</h3>
      <p className="aide">Les ingrédients d’un repas. Le stock baisse à chaque repas servi.</p>

      {lignes.length === 0 && <p className="mention">Aucun ingrédient pour l’instant.</p>}

      {lignes.map((ligne, position) => (
        <div key={ligne.ingredient_id} className="ligne-recette">
          <div className="champ">
            <label htmlFor={`recette-ingredient-${position}`}>Ingrédient</label>
            <select
              id={`recette-ingredient-${position}`}
              value={ligne.ingredient_id}
              onChange={(evenement) => modifierLigne(position, { ingredient_id: Number(evenement.target.value) })}
            >
              {ingredients
                .filter((ingredient) => ingredient.id === ligne.ingredient_id || !dejaChoisis.has(String(ingredient.id)))
                .map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.nom}
                  </option>
                ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor={`recette-quantite-${position}`}>{unite(ligne.ingredient_id)} par repas</label>
            <input
              id={`recette-quantite-${position}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,2"
              value={ligne.quantite}
              onChange={(evenement) => modifierLigne(position, { quantite: evenement.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn-icone btn-fermer"
            aria-label="Retirer cet ingrédient"
            onClick={() => onChange(lignes.filter((_, autre) => autre !== position))}
          >
            <Icone nom="fermer" />
          </button>
        </div>
      ))}

      {lignes.length < ingredients.length && (
        <button type="button" className="btn btn-secondaire btn-petit" onClick={ajouterLigne}>
          + Ajouter un ingrédient
        </button>
      )}
    </div>
  )
}
