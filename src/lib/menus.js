// Appels Supabase de la table menus : lecture pour tous les connectés, écriture réservée à l'admin (RLS).
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { ALLERGENES } from './allergenes'

const COLONNES_MENU =
  'id, jour, entree, plat, dessert, allergenes, prix, prix_employe, photo_url, plat_alternatif, photo_alternative, allergenes_alternatif'

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

// Menus entre deux dates incluses (format 'AAAA-MM-JJ'), du plus tôt au plus tard
export async function chargerMenusEntre(premierJour, dernierJour) {
  const { data, error } = await supabase
    .from('menus')
    .select(COLONNES_MENU)
    .gte('jour', premierJour)
    .lte('jour', dernierJour)
    .order('jour', { ascending: true })
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
