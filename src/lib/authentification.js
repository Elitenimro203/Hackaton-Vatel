// Connexion, inscription, déconnexion et lecture du profil : tous les appels Supabase liés au compte.
import { supabase } from './supabaseClient'
import { avecNomPropre } from './formatage'

export const MOT_DE_PASSE_DEMO = 'Demo2026!'

export const COMPTES_DEMO = [
  { role: 'eleve', libelle: 'Élève', email: 'eleve.demo@cantijuste.ci' },
  { role: 'parent', libelle: 'Parent', email: 'parent.demo@cantijuste.ci' },
  { role: 'cantine', libelle: 'Comptoir', email: 'cantine.demo@cantijuste.ci' },
  { role: 'admin', libelle: 'Admin', email: 'admin.demo@cantijuste.ci' },
]

const LONGUEUR_MINI_MOT_DE_PASSE = 8

// Messages Supabase (en anglais) traduits en phrases françaises
const TRADUCTIONS_ERREURS = [
  ['invalid login credentials', 'E-mail ou mot de passe incorrect.'],
  ['email not confirmed', 'Confirme ton e-mail avec le lien reçu, puis reconnecte-toi.'],
  ['user already registered', 'Un compte existe déjà avec cet e-mail. Connecte-toi.'],
  ['already been registered', 'Un compte existe déjà avec cet e-mail. Connecte-toi.'],
  ['password should be', 'Le mot de passe doit faire au moins 8 caractères.'],
  ['invalid format', 'Cette adresse e-mail n’est pas valide.'],
  ['is invalid', 'Cette adresse e-mail n’est pas valide.'],
  ['rate limit', 'Trop d’essais. Réessaie dans une minute.'],
  ['failed to fetch', 'Pas de connexion internet. Vérifie ton réseau.'],
  ['for security purposes', 'Patiente une minute avant de redemander un lien.'],
  ['should be different', 'Choisis un mot de passe différent de l’ancien.'],
  ['session missing', 'Ce lien a expiré. Demande un nouveau lien.'],
]

// Lu une seule fois au chargement, avant que Supabase ne nettoie l'adresse : la page vient-elle du lien reçu par e-mail ?
const ADRESSE_AU_CHARGEMENT = typeof window === 'undefined' ? '' : window.location.hash

export function traduireErreur(erreur) {
  const message = (erreur?.message || '').toLowerCase()
  const traduction = TRADUCTIONS_ERREURS.find(([morceau]) => message.includes(morceau))
  return traduction ? traduction[1] : 'Une erreur est survenue. Réessaie.'
}

export async function seConnecter(email, motDePasse) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: motDePasse,
  })
  return error ? traduireErreur(error) : null
}

// profil : 'eleve' | 'employe' | 'parent' (jamais admin, donné à la main en SQL)
export async function creerCompte({ nom, email, motDePasse, profil }) {
  if (nom.trim().length < 2) return { erreur: 'Écris ton nom complet.' }
  if (motDePasse.length < LONGUEUR_MINI_MOT_DE_PASSE) {
    return { erreur: 'Le mot de passe doit faire au moins 8 caractères.' }
  }

  const role = profil === 'parent' ? 'parent' : 'eleve'
  const typeUsager = profil === 'employe' ? 'employe' : 'eleve'

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: motDePasse,
    options: { data: { nom: nom.trim(), role, type_usager: typeUsager } },
  })
  if (error) return { erreur: traduireErreur(error) }
  return { erreur: null, connecte: Boolean(data.session) }
}

export async function seDeconnecter() {
  const { error } = await supabase.auth.signOut()
  return error ? traduireErreur(error) : null
}

// Mot de passe oublié : Supabase envoie un lien qui ramène sur l'appli. Il ne dit jamais si le compte existe.
export async function envoyerLienMotDePasse(email) {
  const adresse = email.trim().toLowerCase()
  if (!adresse.includes('@')) return 'Écris ton adresse e-mail.'
  const { error } = await supabase.auth.resetPasswordForEmail(adresse, { redirectTo: window.location.origin })
  return error ? traduireErreur(error) : null
}

export async function changerMotDePasse(motDePasse) {
  if (motDePasse.length < LONGUEUR_MINI_MOT_DE_PASSE) {
    return 'Le mot de passe doit faire au moins 8 caractères.'
  }
  const { error } = await supabase.auth.updateUser({ password: motDePasse })
  return error ? traduireErreur(error) : null
}

export function ouvertDepuisLienRecuperation() {
  return ADRESSE_AU_CHARGEMENT.includes('type=recovery')
}

export function lienRecuperationExpire() {
  return ADRESSE_AU_CHARGEMENT.includes('error_code=otp_expired')
}

// Appelle rappel() quand Supabase signale l'ouverture d'un lien « mot de passe oublié ». Renvoie la fonction pour arrêter.
export function ecouterRecuperation(rappel) {
  const { data } = supabase.auth.onAuthStateChange((evenement) => {
    if (evenement === 'PASSWORD_RECOVERY') rappel()
  })
  return () => data.subscription.unsubscribe()
}

// Appelle rappel(session) tout de suite, puis à chaque connexion ou déconnexion. Renvoie la fonction pour arrêter.
export function ecouterSession(rappel) {
  supabase.auth.getSession().then(({ data }) => rappel(data.session))
  const { data } = supabase.auth.onAuthStateChange((_evenement, session) => rappel(session))
  return () => data.subscription.unsubscribe()
}

export async function chargerProfil(idUtilisateur) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nom, role, type_usager, solde, allergies, regime, autre_allergie')
    .eq('id', idUtilisateur)
    .maybeSingle()
  return { profil: avecNomPropre(data), erreur: error ? traduireErreur(error) : null }
}
