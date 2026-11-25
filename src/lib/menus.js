// Appels Supabase de la table menus : lecture pour tous les connectés, écriture réservée à l'admin (RLS), retirer et dupliquer par RPC.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { ALLERGENES } from './allergenes'
import { CONTENUS } from './regimes'

const COLONNES_MENU =
  'id, jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif, ' +
  'contenu, contenu_alternatif, retire'

export const PRIX_ELEVE_PAR_DEFAUT = 1000
export const PRIX_EMPLOYE_PAR_DEFAUT = 1500

// Codes d'erreur Postgres traduits pour l'admin
function traduireErreurMenu(erreur) {
  if (erreur.code === '23505') return 'Il y a déjà un menu ce jour-là. Modifiez-le plutôt.'
  if (erreur.code === '23503') return 'Des élèves ont déjà réservé ce menu : il ne peut plus être supprimé.'
  if (erreur.code === '42501') return 'Seul l’administrateur peut modifier les menus.'
  if (erreur.code === '23514') return 'Vérifiez les prix et les allergènes.'
  return traduireErreur(erreur)
}

// Menus entre deux dates incluses (format 'AAAA-MM-JJ'), du plus tôt au plus tard.
// Les menus retirés sont cachés, sauf pour l'admin qui passe avecRetires: true.
export async function chargerMenusEntre(premierJour, dernierJour, { avecRetires = false } = {}) {
  let requete = supabase
    .from('menus')
    .select(COLONNES_MENU)
    .gte('jour', premierJour)
    .lte('jour', dernierJour)
    .order('jour', { ascending: true })
  if (!avecRetires) requete = requete.eq('retire', false)
  const { data, error } = await requete
  return { menus: data || [], erreur: error ? traduireErreurMenu(error) : null }
}

// Prix payé par la personne connectée : prix élève ou prix employé
export function prixPourProfil(menu, profil) {
  return profil.type_usager === 'employe' ? menu.prix_employe : menu.prix
}

function estPrixValide(prix) {
  return Number.isInteger(prix) && prix > 0
}

// Vérifie le formulaire et renvoie la ligne prête pour la base, ou un message d'erreur
export function preparerMenu(champs) {
  const prix = Number(champs.prix)
  const prixEmploye = Number(champs.prixEmploye)
  const photo = champs.photoUrl.trim()
  const photoAlternative = champs.photoAlternative.trim()
  const allergenesConnus = ALLERGENES.map((allergene) => allergene.valeur)
  const contenusConnus = CONTENUS.map((contenu) => contenu.valeur)

  if (!champs.jour) return { erreur: 'Choisissez la date du menu.' }
  if (champs.plat.trim().length < 2) return { erreur: 'Écrivez le nom du plat principal.' }
  if (!estPrixValide(prix) || !estPrixValide(prixEmploye)) {
    return { erreur: 'Les prix doivent être des nombres entiers de FCFA, sans virgule.' }
  }
  if ([photo, photoAlternative].some((adresse) => adresse && !/^(https?:\/\/|\/)/.test(adresse))) {
    return { erreur: 'L’adresse d’une photo doit commencer par https:// ou par /photos/.' }
  }

  return {
    erreur: null,
    ligne: {
      jour: champs.jour,
      entree: champs.entree.trim(),
      plat: champs.plat.trim(),
      dessert: champs.dessert.trim(),
      allergenes: champs.allergenes.filter((valeur) => allergenesConnus.includes(valeur)),
      prix,
      prix_employe: prixEmploye,
      photo_url: photo || null,
      plat_alternatif: champs.platAlternatif.trim(),
      photo_alternative: photoAlternative || null,
      allergenes_alternatif: champs.allergenesAlternatif.filter((valeur) => allergenesConnus.includes(valeur)),
      contenu: champs.contenu.filter((valeur) => contenusConnus.includes(valeur)),
      contenu_alternatif: champs.contenuAlternatif.filter((valeur) => contenusConnus.includes(valeur)),
    },
  }
}

// Ajoute un menu (idMenu vide) ou modifie celui qui a cet id. Renvoie { erreur, idMenu } : erreur vaut null si tout va bien.
export async function enregistrerMenu(ligne, idMenu = null) {
  const requete = idMenu
    ? supabase.from('menus').update(ligne).eq('id', idMenu).select('id')
    : supabase.from('menus').insert(ligne).select('id')
  const { data, error } = await requete
  if (error) return { erreur: traduireErreurMenu(error), idMenu: null }
  if (!data || data.length === 0) return { erreur: 'Seul l’administrateur peut modifier les menus.', idMenu: null }
  return { erreur: null, idMenu: data[0].id }
}

export async function supprimerMenu(idMenu) {
  const { data, error } = await supabase.from('menus').delete().eq('id', idMenu).select('id')
  if (error) return traduireErreurMenu(error)
  if (!data || data.length === 0) return 'Ce menu n’existe plus ou vous n’avez pas le droit de le supprimer.'
  return null
}

// Retire le menu : caché aux élèves, réservations à venir remboursées. Renvoie { erreur, rembourses }
export async function retirerMenu(idMenu) {
  const { data, error } = await supabase.rpc('retirer_menu', { p_menu_id: idMenu })
  if (error) return { erreur: traduireErreurMenu(error), rembourses: 0 }
  if (!data.ok) return { erreur: data.message, rembourses: 0 }
  return { erreur: null, rembourses: data.rembourses }
}

// Remet au menu un plat retiré. Renvoie null si c'est fait, sinon le message d'erreur
export async function remettreAuMenu(idMenu) {
  const { data, error } = await supabase.rpc('remettre_au_menu', { p_menu_id: idMenu })
  if (error) return traduireErreurMenu(error)
  return data === 'ok' ? null : data
}

// Copie le menu (avec sa recette) vers un jour libre. Renvoie null si c'est fait, sinon le message d'erreur
export async function dupliquerMenu(idMenu, jour) {
  const { data, error } = await supabase.rpc('dupliquer_menu', { p_menu_id: idMenu, p_jour: jour })
  if (error) return traduireErreurMenu(error)
  return data === 'ok' ? null : data
}

// Copie les menus d'une semaine vers une autre (jours pris ou passés sautés). Renvoie { erreur, copies, sautes }
export async function dupliquerSemaine(lundiSource, lundiCible) {
  const { data, error } = await supabase.rpc('dupliquer_semaine', { p_lundi_source: lundiSource, p_lundi_cible: lundiCible })
  if (error) return { erreur: traduireErreurMenu(error), copies: 0, sautes: 0 }
  if (!data.ok) return { erreur: data.message, copies: 0, sautes: 0 }
  return { erreur: null, copies: data.copies, sautes: data.sautes }
}
