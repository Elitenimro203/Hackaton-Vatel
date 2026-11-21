// Analyse des avis (onglet Insights de l'admin) : l'IA lit et classe (via /api/analyser-avis), le SQL compte et décide du statut, l'humain tranche.
// Si l'IA est injoignable (pas de réseau, pas de clé, erreur serveur, ou « npm run dev » sans /api), on bascule sur le mode secours par mots-clés.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'

const ADRESSE_API = '/api/analyser-avis'
const TAILLE_PAQUET = 25

// « Tiède », « TIEDE » → « tiede » : minuscules, sans accents
function normaliser(texte) {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function sentimentDesEtoiles(etoiles) {
  if (etoiles >= 4) return 'positif'
  if (etoiles === 3) return 'neutre'
  return 'negatif'
}

// Extrait d'environ 12 mots autour du premier mot-clé trouvé (ou le début du commentaire)
function extraitAutour(commentaire, motCle) {
  const mots = (commentaire || '').split(/\s+/).filter(Boolean)
  if (mots.length === 0) return ''
  const position = motCle ? mots.findIndex((mot) => normaliser(mot).includes(normaliser(motCle).split(' ')[0])) : -1
  const debut = Math.max(0, position - 4)
  return mots.slice(debut, debut + 12).join(' ')
}

// Mode secours, en JavaScript pur. avis = [{ id, etoiles, commentaire }], themes = [{ code, mots_cles }].
// Renvoie le même format que l'IA : [{ id, codages: [{ theme, sentiment, confiance, extrait }] }]
export function coderParMotsCles(avis, themes) {
  return avis.map((unAvis) => {
    const texte = normaliser(unAvis.commentaire)
    const sentiment = sentimentDesEtoiles(unAvis.etoiles)

    const trouves = themes
      .map((theme) => {
        const motsTrouves = (theme.mots_cles || []).filter((mot) => texte.includes(normaliser(mot)))
        return { code: theme.code, motsTrouves }
      })
      .filter((theme) => theme.motsTrouves.length > 0)
      .sort((a, b) => b.motsTrouves.length - a.motsTrouves.length)
      .slice(0, 3)

    if (trouves.length === 0) {
      return {
        id: unAvis.id,
        codages: [{ theme: 'gout', sentiment, confiance: 0.3, extrait: extraitAutour(unAvis.commentaire, null) }],
      }
    }
    return {
      id: unAvis.id,
      codages: trouves.map((theme) => ({
        theme: theme.code,
        sentiment,
        confiance: theme.motsTrouves.length >= 2 ? 0.6 : 0.45,
        extrait: extraitAutour(unAvis.commentaire, theme.motsTrouves[0]),
      })),
    }
  })
}

// Enregistre des codages (source 'ia' ou 'mots_cles') ; le SQL calcule le statut 'auto' ou 'a_revoir'.
// Renvoie { enregistres, avisIgnores, erreur }
export async function enregistrerCodages(resultats, source) {
  const { data, error } = await supabase.rpc('enregistrer_codages', { p_resultats: resultats, p_source: source })
  if (error) return { enregistres: 0, avisIgnores: 0, erreur: traduireErreur(error) }
  return { enregistres: data.enregistres, avisIgnores: data.avis_ignores, erreur: null }
}

async function jetonDeSession() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

// Appelle la fonction serveur. Renvoie { donnees } ou { erreur, statut, secours } (secours = basculer sur les mots-clés)
async function appelerApi(corps, jeton) {
  let reponse
  try {
    reponse = await fetch(ADRESSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify(corps),
    })
  } catch {
    return { erreur: 'Pas de connexion avec le serveur d’analyse.', statut: 0, secours: true }
  }

  let donnees = null
  try {
    donnees = await reponse.json()
  } catch {
    donnees = null
  }
  if (reponse.ok && donnees) return { donnees }

  const message = donnees?.erreur || `Serveur d’analyse indisponible (${reponse.status}).`
  // 401 / 403 : problème de compte, les mots-clés n'y changeraient rien. Le reste (404 en local, 5xx, réponse illisible) : secours.
  const secours = ![401, 403].includes(reponse.status)
  return { erreur: message, statut: reponse.status, secours }
}

// Analyse tous les avis sans codage, par paquets de 25. onProgres(fait, total) est appelé après chaque paquet.
// Renvoie { total, enregistres, aRevoir, mode: 'ia' | 'mots_cles' | 'mixte', secours: message ou null, erreur }
export async function analyserAvis(onProgres = () => {}) {
  const [resultatThemes, resultatAvis] = await Promise.all([
    supabase.from('themes').select('code, libelle, mots_cles'),
    supabase.rpc('avis_sans_codage', { p_limite: 1000 }),
  ])
  const erreurLecture = resultatThemes.error || resultatAvis.error
  if (erreurLecture) return { total: 0, enregistres: 0, mode: null, secours: null, erreur: traduireErreur(erreurLecture) }

  const themes = resultatThemes.data || []
  const avis = resultatAvis.data || []
  const total = avis.length
  const bilan = { total, enregistres: 0, mode: null, secours: null, erreur: null }
  onProgres(0, total)
  if (total === 0) return bilan

  const jeton = await jetonDeSession()
  let utiliserIa = Boolean(jeton)
  if (!jeton) bilan.secours = 'Session introuvable : analyse par mots-clés.'
  const modesUtilises = new Set()

  for (let debut = 0; debut < total; debut += TAILLE_PAQUET) {
    const paquet = avis.slice(debut, debut + TAILLE_PAQUET)
    let resultats = null
    let source = 'mots_cles'

    if (utiliserIa) {
      const appel = await appelerApi(
        {
          mode: 'coder',
          themes: themes.map(({ code, libelle }) => ({ code, libelle })),
          avis: paquet.map(({ id, plat, etoiles, commentaire }) => ({ id, plat, etoiles, commentaire })),
        },
        jeton,
      )
      if (appel.donnees) {
        resultats = appel.donnees.resultats
        source = 'ia'
      } else if (appel.secours) {
        utiliserIa = false
        bilan.secours = `${appel.erreur} Suite de l’analyse par mots-clés.`
      } else {
        bilan.erreur = appel.erreur
        break
      }
    }

    if (!resultats) resultats = coderParMotsCles(paquet, themes)
    const enregistrement = await enregistrerCodages(resultats, source)
    if (enregistrement.erreur) {
      bilan.erreur = enregistrement.erreur
      break
    }
    bilan.enregistres += enregistrement.enregistres
    modesUtilises.add(source)
    onProgres(Math.min(debut + paquet.length, total), total)
  }

  bilan.mode = modesUtilises.size > 1 ? 'mixte' : [...modesUtilises][0] || null
  return bilan
}

// Résumé de la semaine par l'IA à partir des chiffres calculés en SQL (jamais les avis bruts).
// Renvoie { resume: [3 phrases], actions: [3 actions], erreur }
export async function resumerSemaine(chiffres) {
  const jeton = await jetonDeSession()
  if (!jeton) return { resume: [], actions: [], erreur: 'Connexion requise.' }
  const appel = await appelerApi({ mode: 'resumer', chiffres }, jeton)
  if (appel.erreur) return { resume: [], actions: [], erreur: appel.erreur }
  return { resume: appel.donnees.resume, actions: appel.donnees.actions, erreur: null }
}

// L'humain tranche : même thème et même sentiment → validé ; sinon corrigé. Renvoie null si c'est fait, sinon le message.
export async function reviserCodage(idCodage, theme, sentiment) {
  const { data, error } = await supabase.rpc('reviser_codage', {
    p_codage_id: idCodage,
    p_theme: theme,
    p_sentiment: sentiment,
  })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}
