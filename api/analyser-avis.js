// Fonction serveur Vercel : l'IA lit et classe les avis (mode "coder") ou rédige le résumé de la semaine à partir des chiffres SQL (mode "resumer").
// Seul endroit qui connaît la clé ANTHROPIC_API_KEY (variable d'environnement Vercel, jamais dans le code React, jamais en VITE_).
// Réservé à l'admin : l'appel doit porter le jeton de session Supabase (Authorization: Bearer <jeton>).
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

const MODELE = 'claude-opus-5-5'
const AVIS_MAX_PAR_APPEL = 25
const CODES_THEMES = ['gout', 'portion', 'temperature', 'attente', 'prix', 'variete', 'allergies', 'accueil']
const SENTIMENTS = ['positif', 'neutre', 'negatif']

// Erreur avec code HTTP et message en français, renvoyée telle quelle au navigateur
class ErreurHttp extends Error {
  constructor(statut, message) {
    super(message)
    this.statut = statut
  }
}

// Format imposé à la réponse du mode "coder"
const SCHEMA_CODAGES = {
  type: 'object',
  properties: {
    resultats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          codages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: CODES_THEMES },
                sentiment: { type: 'string', enum: SENTIMENTS },
                confiance: { type: 'number', description: 'Entre 0 et 1' },
                extrait: { type: 'string', description: '5 à 12 mots copiés mot pour mot de l’avis' },
              },
              required: ['theme', 'sentiment', 'confiance', 'extrait'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'codages'],
        additionalProperties: false,
      },
    },
  },
  required: ['resultats'],
  additionalProperties: false,
}

// Format imposé à la réponse du mode "resumer"
const SCHEMA_RESUME = {
  type: 'object',
  properties: {
    resume: { type: 'array', items: { type: 'string' }, description: 'Exactement 3 phrases' },
    actions: { type: 'array', items: { type: 'string' }, description: 'Exactement 3 actions concrètes' },
  },
  required: ['resume', 'actions'],
  additionalProperties: false,
}

function promptCodage(themes) {
  const liste = themes.map((theme) => `- ${theme.code} : ${theme.libelle}`).join('\n')
  return `Tu es un analyste qualité de cantine scolaire en Côte d'Ivoire. Tu lis des avis d'élèves sur leurs repas et tu les classes.

Règles :
- Tu utilises UNIQUEMENT les 8 thèmes ci-dessous (par leur code), jamais un autre :
${liste}
- Chaque avis reçoit 1 à 3 thèmes, pas plus. Un thème n'apparaît qu'une fois par avis.
- Sentiment : positif, neutre ou negatif, pour ce thème précis.
- Confiance entre 0 et 1. Elle est basse (sous 0,7) si l'avis est ironique, ambigu, trop court, sans commentaire, ou si les étoiles contredisent le texte. Sinon elle peut être haute.
- L'extrait fait 5 à 12 mots copiés mot pour mot dans le commentaire (même orthographe). S'il n'y a pas de commentaire, l'extrait est une chaîne vide.
- Tu renvoies un résultat pour chaque avis reçu, avec le même id.`
}

const PROMPT_RESUME = `Tu aides le gérant d'une cantine scolaire à lire les avis de la semaine. Tu reçois des chiffres déjà calculés.

Règles :
- Écris exactement 3 phrases de résumé et exactement 3 actions concrètes pour la semaine prochaine.
- Chaque phrase du résumé cite au moins un chiffre fourni. N'invente aucun chiffre : utilise seulement ceux que tu reçois.
- Ton direct et simple, en français, pour un gérant de cantine. Pas de jargon.
- Une action commence par un verbe et peut se faire en cuisine ou au comptoir.`

// Vérifie le jeton Supabase et le rôle admin (RPC mon_role, avec la RLS de l'utilisateur)
async function verifierAdmin(req) {
  const entete = req.headers.authorization || ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : ''
  if (!jeton) throw new ErreurHttp(401, 'Connexion requise.')

  const url = process.env.VITE_SUPABASE_URL
  const cleAnonyme = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cleAnonyme) throw new ErreurHttp(500, 'Supabase n’est pas configuré sur le serveur.')

  const supabase = createClient(url, cleAnonyme, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: role, error } = await supabase.rpc('mon_role')
  if (error) throw new ErreurHttp(401, 'Session expirée : reconnecte-toi.')
  if (role !== 'admin') throw new ErreurHttp(403, 'Réservé à l’administrateur.')
}

// Appelle Claude avec une réponse JSON imposée ; renvoie l'objet lu
async function demanderJson(systeme, contenu, schema) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErreurHttp(503, 'Clé de l’IA absente sur le serveur : mode secours.')
  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })

  let reponse
  try {
    reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 8000,
      system: systeme,
      messages: [{ role: 'user', content: contenu }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      // Si le modèle refuse une demande, l'API la relance d'elle-même sur un autre modèle
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (erreur) {
    if (erreur instanceof Anthropic.AuthenticationError) throw new ErreurHttp(503, 'Clé de l’IA invalide : mode secours.')
    if (erreur instanceof Anthropic.RateLimitError) throw new ErreurHttp(503, 'L’IA est saturée, réessaie dans une minute.')
    if (erreur instanceof Anthropic.APIConnectionError) throw new ErreurHttp(502, 'L’IA ne répond pas.')
    if (erreur instanceof Anthropic.APIError) throw new ErreurHttp(502, 'L’IA a renvoyé une erreur.')
    throw erreur
  }

  if (reponse.stop_reason !== 'end_turn') {
    throw new ErreurHttp(502, `Réponse de l’IA incomplète (${reponse.stop_reason}).`)
  }
  const texte = reponse.content.find((bloc) => bloc.type === 'text')?.text
  try {
    return JSON.parse(texte)
  } catch {
    throw new ErreurHttp(502, 'Réponse de l’IA illisible.')
  }
}

async function coder(corps) {
  const avis = Array.isArray(corps.avis) ? corps.avis : []
  if (avis.length === 0) throw new ErreurHttp(400, 'Aucun avis à analyser.')
  if (avis.length > AVIS_MAX_PAR_APPEL) throw new ErreurHttp(400, `${AVIS_MAX_PAR_APPEL} avis au plus par appel.`)

  const themesRecus = Array.isArray(corps.themes) ? corps.themes : []
  const themes = CODES_THEMES.map((code) => ({
    code,
    libelle: String(themesRecus.find((theme) => theme?.code === code)?.libelle || code),
  }))

  const avisPropres = avis.map((un) => ({
    id: Number(un.id),
    plat: String(un.plat || ''),
    etoiles: Number(un.etoiles),
    commentaire: un.commentaire ? String(un.commentaire).slice(0, 280) : '(pas de commentaire)',
  }))
  if (avisPropres.some((un) => !Number.isInteger(un.id))) throw new ErreurHttp(400, 'Chaque avis doit avoir un id entier.')

  const resultat = await demanderJson(
    promptCodage(themes),
    `Voici ${avisPropres.length} avis à classer (JSON) :\n${JSON.stringify(avisPropres)}`,
    SCHEMA_CODAGES,
  )

  // On ne garde que les avis envoyés, et 3 thèmes au plus par avis (le SQL revérifie tout)
  const idsEnvoyes = new Set(avisPropres.map((un) => un.id))
  const resultats = (resultat.resultats || [])
    .filter((ligne) => idsEnvoyes.has(ligne.id))
    .map((ligne) => ({ id: ligne.id, codages: (ligne.codages || []).slice(0, 3) }))
  return { resultats }
}

async function resumer(corps) {
  const chiffres = corps.chiffres
  if (!chiffres || typeof chiffres !== 'object' || Array.isArray(chiffres)) {
    throw new ErreurHttp(400, 'Chiffres manquants.')
  }
  const resultat = await demanderJson(
    PROMPT_RESUME,
    `Chiffres de la semaine (calculés par la base de données) :\n${JSON.stringify(chiffres).slice(0, 20000)}`,
    SCHEMA_RESUME,
  )
  return { resume: (resultat.resume || []).slice(0, 3), actions: (resultat.actions || []).slice(0, 3) }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new ErreurHttp(405, 'Méthode non autorisée : utilise POST.')
    await verifierAdmin(req)

    const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    if (corps.mode === 'coder') return res.status(200).json(await coder(corps))
    if (corps.mode === 'resumer') return res.status(200).json(await resumer(corps))
    throw new ErreurHttp(400, 'Mode inconnu : "coder" ou "resumer".')
  } catch (erreur) {
    if (erreur instanceof ErreurHttp) return res.status(erreur.statut).json({ erreur: erreur.message })
    if (erreur instanceof SyntaxError) return res.status(400).json({ erreur: 'Requête illisible (JSON attendu).' })
    // Pas de trace ni de clé renvoyée au navigateur : seulement dans les journaux Vercel
    console.error('analyser-avis :', erreur?.name, erreur?.message)
    return res.status(500).json({ erreur: 'Erreur interne du serveur d’analyse.' })
  }
}
