// Abonnement temps réel Supabase : prévient dès qu'une ligne d'une table change.
import { supabase } from './supabaseClient'

let compteurCanaux = 0

// filtre facultatif au format Supabase, ex. 'id=eq.42'. Renvoie la fonction pour arrêter l'écoute.
export function ecouterTable(table, filtre, rappel) {
  compteurCanaux += 1
  const reglage = { event: '*', schema: 'public', table }
  if (filtre) reglage.filter = filtre

  const canal = supabase
    .channel(`temps-reel-${table}-${compteurCanaux}`)
    .on('postgres_changes', reglage, rappel)
    .subscribe()

  return () => supabase.removeChannel(canal)
}
