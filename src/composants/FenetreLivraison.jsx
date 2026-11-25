// Fenêtre « + Livraison » : on saisit la quantité reçue d'un ingrédient et on l'ajoute au stock (RPC entree_stock).
import { useState } from 'react'
import { enregistrerLivraison } from '../lib/stocks'
import { formaterNombreStock, formaterQuantite } from '../lib/formatage'
import Icone from './Icone'
import '../allergies.css'

export default function FenetreLivraison({ ingredient, afficherToast, onEnregistre, onFermer }) {
  // On propose d'emblée la quantité qui manque, arrondie à l'unité au-dessus
  const [quantite, setQuantite] = useState(Number(ingredient.manque) > 0 ? String(Math.ceil(Number(ingredient.manque))) : '')
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function envoyer(evenement) {
    evenement.preventDefault()
    const valeur = Number(quantite.replace(',', '.'))
    if (!(valeur > 0)) {
      setErreur('Saisissez la quantité reçue, par exemple 10.')
      return
    }

    setErreur(null)
    setEnvoiEnCours(true)
    const erreurBase = await enregistrerLivraison(ingredient.ingredient_id, valeur)
    setEnvoiEnCours(false)

    if (erreurBase) {
      setErreur(erreurBase)
      afficherToast(erreurBase, 'erreur')
      return
    }
    afficherToast(`Livraison enregistrée : ${formaterQuantite(valeur, ingredient.unite)} de ${ingredient.nom.toLowerCase()}.`)
    onEnregistre()
  }

  return (
    <div className="voile">
      <form className="fenetre-bas fenetre-centre pile" onSubmit={envoyer} noValidate aria-labelledby="titre-livraison" role="dialog" aria-modal="true">
        <div className="espace-entre">
          <span className="surtitre">Nouvelle livraison</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer" disabled={envoiEnCours}>
            <Icone nom="fermer" />
          </button>
        </div>
        <h2 id="titre-livraison">{ingredient.nom}</h2>
        <p className="aide">Stock actuel : {formaterNombreStock(ingredient.quantite)} {ingredient.unite}</p>

        <div className={erreur ? 'champ champ-erreur' : 'champ'}>
          <label htmlFor="quantite-livraison">Quantité reçue ({ingredient.unite})</label>
          <input
            id="quantite-livraison"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={quantite}
            onChange={(evenement) => setQuantite(evenement.target.value)}
            autoFocus
          />
          {erreur && <span className="champ-message" role="alert">{erreur}</span>}
        </div>

        <button type="submit" className="btn" disabled={envoiEnCours}>
          {envoiEnCours ? 'Enregistrement…' : 'Ajouter au stock'}
        </button>
        <button type="button" className="btn btn-discret" onClick={onFermer} disabled={envoiEnCours}>
          Annuler
        </button>
      </form>
    </div>
  )
}
