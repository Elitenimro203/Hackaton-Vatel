// Appels Supabase des stocks (admin) : besoins d'un jour, livraisons, ingrédients et recette d'un menu.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

// Besoins en ingrédients d'un jour de service (jour vide = prochain jour de service), comparés au stock.
// Renvoie { besoins, erreur } ; chaque ligne : { ingredient_id, nom, unite, quantite, seuil, besoin, manque, statut, jour, repas }
export async function chargerBesoins(jour = null) {
  const { data, error } = await supabase.rpc('besoins_stock', { p_jour: jour })
  return { besoins: data || [], erreur: error ? traduireErreur(error) : null }
}

// Enregistre une livraison. Renvoie null si c'est fait, sinon le message d'erreur en français.
export async function enregistrerLivraison(idIngredient, quantite) {
  const { data, error } = await supabase.rpc('entree_stock', { p_ingredient_id: idIngredient, p_quantite: quantite })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// Les dernières livraisons reçues, la plus récente d'abord
export async function chargerDernieresLivraisons(limite = 5) {
  const { data, error } = await supabase
    .from('mouvements_stock')
    .select('id, quantite, cree_le, ingredients(nom, unite)')
    .gt('quantite', 0)
    .order('cree_le', { ascending: false })
    .limit(limite)
  return { livraisons: data || [], erreur: error ? traduireErreur(error) : null }
}

// Tous les ingrédients, pour le choix dans la recette d'un menu
export async function chargerIngredients() {
  const { data, error } = await supabase.from('ingredients').select('id, nom, unite').order('nom', { ascending: true })
  return { ingredients: data || [], erreur: error ? traduireErreur(error) : null }
}

// La recette d'un menu : lignes { ingredient_id, quantite } (quantité en texte pour le champ de saisie)
export async function chargerRecette(idMenu) {
  const { data, error } = await supabase
    .from('ingredients_par_menu')
    .select('ingredient_id, quantite_par_repas')
    .eq('menu_id', idMenu)
  return {
    lignes: (data || []).map((ligne) => ({ ingredient_id: ligne.ingredient_id, quantite: String(ligne.quantite_par_repas) })),
    erreur: error ? traduireErreur(error) : null,
  }
}

// Vérifie la saisie de la recette (quantités positives, un seul ingrédient par ligne) et la prépare pour la base.
// Renvoie { erreur, lignes }.
export function preparerRecette(lignes) {
  const preparees = []
  for (const ligne of lignes) {
    if (!ligne.ingredient_id) continue
    const quantite = Number(String(ligne.quantite).replace(',', '.'))
    if (!(quantite > 0) || quantite > 1000) return { erreur: 'Vérifiez les quantités de la recette.', lignes: [] }
    preparees.push({ ingredient_id: Number(ligne.ingredient_id), quantite })
  }
  const identifiants = new Set(preparees.map((ligne) => ligne.ingredient_id))
  if (identifiants.size !== preparees.length) return { erreur: 'Un ingrédient ne peut apparaître qu’une fois dans la recette.', lignes: [] }
  return { erreur: null, lignes: preparees }
}

// Remplace la recette d'un menu. Renvoie null si c'est fait, sinon le message d'erreur.
export async function enregistrerRecette(idMenu, lignes) {
  const { data, error } = await supabase.rpc('enregistrer_recette', { p_menu_id: idMenu, p_lignes: lignes })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}
