// Carte d'un ingrédient : nom, quantité restante en gros avec son unité, jauge (feuille, safran, rouge), besoin du jour et bouton « + Livraison ».
import { formaterNombreStock, formaterQuantite } from '../lib/formatage'

const STATUTS = {
  ok: { libelle: 'En stock', classeBadge: 'badge badge-succes', classeJauge: 'jauge' },
  bas: { libelle: 'Stock bas', classeBadge: 'badge badge-attention', classeJauge: 'jauge jauge-bas' },
  rupture: { libelle: 'Rupture prévue', classeBadge: 'badge badge-erreur', classeJauge: 'jauge jauge-rupture' },
}

// libelleJour : « demain », « aujourd'hui » ou « lundi 23 novembre » (déjà précédé de la préposition : « de demain », « du lundi… »)
export default function CarteIngredient({ ingredient, libelleJour, onLivraison }) {
  const statut = STATUTS[ingredient.statut] || STATUTS.ok
  const maximumJauge = Math.max(Number(ingredient.seuil) * 3, Number(ingredient.quantite), Number(ingredient.besoin), 1)

  return (
    <li className={ingredient.statut === 'ok' ? 'carte carte-ingredient' : `carte carte-ingredient carte-ingredient-${ingredient.statut}`}>
      <div className="espace-entre">
        <h3 className="ingredient-nom">{ingredient.nom}</h3>
        <span className={statut.classeBadge}>{statut.libelle}</span>
      </div>

      <span className="chiffre-nombre">
        {formaterNombreStock(ingredient.quantite)}
        <span className="chiffre-unite">{ingredient.unite}</span>
      </span>

      <progress className={statut.classeJauge} value={ingredient.quantite} max={maximumJauge}>
        {formaterQuantite(ingredient.quantite, ingredient.unite)}
      </progress>

      <p className="aide">
        {Number(ingredient.besoin) > 0
          ? `Il en faut ${formaterQuantite(ingredient.besoin, ingredient.unite)} pour les réservations ${libelleJour}.`
          : `Aucun besoin pour les réservations ${libelleJour}.`}
      </p>
      <p className="mention">Seuil d’alerte : {formaterQuantite(ingredient.seuil, ingredient.unite)}</p>

      <button type="button" className="btn btn-secondaire" onClick={() => onLivraison(ingredient)}>
        + Livraison
      </button>
    </li>
  )
}
