// Appels Supabase du comptoir (rôle cantine ou admin) : lire un ticket sans le servir, avant de remettre le repas.
import { supabase } from './supabaseClient'
import { avecNomPropre } from './formatage'
import { traduireErreur } from './authentification'

// Renvoie { ticket, erreur } : ticket.resultat = 'a_remettre', 'deja_servi', 'pas_aujourdhui', 'inconnu' ou 'refuse'
export async function lireTicket(code) {
  const { data, error } = await supabase.rpc('lire_ticket', { p_code: code })
  if (error) return { ticket: null, erreur: traduireErreur(error) }
  return { ticket: avecNomPropre(data), erreur: null }
}
