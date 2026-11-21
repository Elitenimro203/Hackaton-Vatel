// Chiffres de l'onglet Insights : tout est compté en SQL (stats_insights ne retient que les codages auto, valide, corrige).
// Ici : appels Supabase, phrases de secours construites en JavaScript, import et export CSV.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { ajouterJours, dateDuJour } from './formatage'
import { ecrireCsv, lireCsv } from './csv'

export const PERIODES = [
  { id: '7', libelle: '7 derniers jours', jours: 7 },
  { id: '28', libelle: '4 semaines', jours: 28 },
]

export const SENTIMENTS = [
  { code: 'positif', libelle: 'Positif' },
  { code: 'neutre', libelle: 'Neutre' },
  { code: 'negatif', libelle: 'Négatif' },
]

export function libelleSentiment(code) {
  return SENTIMENTS.find((sentiment) => sentiment.code === code)?.libelle.toLowerCase() || code
}

// { debut, fin } de la période : jours inclus, fin = aujourd'hui
export function bornesPeriode(jours) {
  const fin = dateDuJour()
  return { debut: ajouterJours(fin, -(jours - 1)), fin }
}

export function partPourcent(valeur, total) {
  return total > 0 ? Math.round((valeur * 100) / total) : 0
}

// ---------- Appels Supabase ----------

export async function chargerStats(debut, fin) {
  const { data, error } = await supabase.rpc('stats_insights', { p_debut: debut, p_fin: fin })
  return { stats: error ? null : data, erreur: error ? traduireErreur(error) : null }
}

// Les 8 thèmes (codes et libellés), pour les listes de correction
export async function chargerThemes() {
  const { data, error } = await supabase.from('themes').select('code, libelle').order('libelle')
  return { themes: data || [], erreur: error ? traduireErreur(error) : null }
}

export async function chargerFileRevue(limite = 30) {
  const { data, error } = await supabase.rpc('file_revue', { p_limite: limite })
  const codages = data || []
  return { codages, total: codages.length > 0 ? Number(codages[0].total) : 0, erreur: error ? traduireErreur(error) : null }
}

export async function chargerAvisDuTheme(theme, debut, fin) {
  const { data, error } = await supabase.rpc('avis_du_theme', { p_theme: theme, p_debut: debut, p_fin: fin, p_limite: 60 })
  return { avis: data || [], erreur: error ? traduireErreur(error) : null }
}

// Renvoie null si le codage est écarté de la file, sinon le message d'erreur
export async function ignorerCodage(idCodage) {
  const { data, error } = await supabase.rpc('ignorer_codage', { p_codage_id: idCodage })
  if (error) return traduireErreur(error)
  return data === 'ok' ? null : data
}

// ---------- Phrases construites en JavaScript ----------

// « ▲ +40 % » en rouge si les avis négatifs montent, « ▼ −12 % » en vert s'ils baissent
export function evolutionTheme(theme) {
  const evolution = theme.evolution_negatifs
  if (evolution === null || evolution === undefined) {
    return theme.negatif > 0 && theme.negatif_prec === 0
      ? { texte: '▲ Nouveau', hausse: true, titre: 'Aucun avis négatif la période précédente' }
      : { texte: '—', hausse: false, titre: 'Pas de comparaison possible' }
  }
  if (evolution === 0) return { texte: '= stable', hausse: false, titre: 'Même nombre d’avis négatifs que la période précédente' }
  const hausse = evolution > 0
  return {
    texte: `${hausse ? '▲ +' : '▼ −'}${Math.abs(evolution)} %`,
    hausse,
    titre: 'Évolution des avis négatifs par rapport à la période précédente',
  }
}

// « Foutou sauce claire : 38 % des avis disent que la portion est trop grande. Essayez −10 % de portion. »
export function phrasePortion(plats) {
  const pire = plats[0]
  if (!pire || pire.part_pct < 15) return 'Aucune portion ne pose problème pour l’instant : moins de 15 % des avis en parlent.'
  return `${pire.plat} : ${pire.part_pct} % des avis disent que la portion est trop grande. Essayez −10 % de portion.`
}

// Les chiffres envoyés à l'IA pour rédiger le résumé : calculés en SQL, jamais les avis bruts
export function chiffresPourIa(stats) {
  return {
    periode: `${stats.debut} au ${stats.fin}`,
    avis_total: stats.avis_total,
    avis_analyses: stats.avis_analyses,
    note_moyenne_sur_5: stats.note_moyenne,
    accord_ia_humain_pourcent: stats.accord_ia_humain,
    themes: stats.themes.map((theme) => ({
      theme: theme.libelle,
      avis: theme.avis,
      pourcent_positif: partPourcent(theme.positif, theme.positif + theme.neutre + theme.negatif),
      pourcent_negatif: partPourcent(theme.negatif, theme.positif + theme.neutre + theme.negatif),
      evolution_avis_negatifs_pourcent: theme.evolution_negatifs,
    })),
    portions: stats.portion.slice(0, 3).map((plat) => ({
      plat: plat.plat,
      avis: plat.avis,
      pourcent_avis_portion_trop_grande: plat.part_pct,
      pourcent_repas_non_consommes: plat.taux_non_servis,
    })),
  }
}

// Résumé de secours quand l'IA ne répond pas : 3 phrases et 3 actions bâties sur les mêmes chiffres
export function resumeDeSecours(stats) {
  const themes = stats.themes
  if (themes.length === 0) return { resume: [], actions: [] }
  const part = (theme) => partPourcent(theme.negatif, theme.positif + theme.neutre + theme.negatif)
  const plusCritique = [...themes].filter((theme) => theme.avis >= 5).sort((a, b) => part(b) - part(a))[0] || themes[0]
  const plusCite = themes[0]
  const enHausse = [...themes].filter((theme) => (theme.evolution_negatifs ?? 0) > 0 && theme.negatif >= 5).sort((a, b) => b.evolution_negatifs - a.evolution_negatifs)[0]
  const portion = stats.portion[0]

  const resume = [
    `${stats.avis_analyses} avis sur ${stats.avis_total} sont classés, avec une note moyenne de ${String(stats.note_moyenne ?? '—').replace('.', ',')} sur 5.`,
    `Le thème le plus cité est « ${plusCite.libelle} » (${plusCite.avis} avis) ; le plus critiqué est « ${plusCritique.libelle} » avec ${part(plusCritique)} % d’avis négatifs.`,
    enHausse
      ? `Les avis négatifs sur « ${enHausse.libelle} » montent de ${enHausse.evolution_negatifs} % par rapport à la période précédente.`
      : 'Aucun thème n’a de hausse marquée d’avis négatifs par rapport à la période précédente.',
  ]
  const actions = [
    `Regarder en priorité les avis « ${plusCritique.libelle} » (${plusCritique.negatif} avis négatifs).`,
    portion && portion.part_pct >= 15
      ? `Essayer −10 % de portion sur « ${portion.plat} » (${portion.part_pct} % des avis disent qu’elle est trop grande).`
      : 'Garder les portions actuelles : très peu d’avis les jugent trop grandes.',
    stats.codages_a_revoir > 0
      ? `Trancher les ${stats.codages_a_revoir} codages douteux de la file « À revoir ».`
      : 'Relancer l’analyse quand de nouveaux avis arrivent.',
  ]
  return { resume, actions }
}

// ---------- Import CSV ----------

function normaliserEntete(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const NOMS_COLONNES = {
  date: ['date', 'jour'],
  plat: ['plat', 'repas', 'menu'],
  etoiles: ['etoiles', 'etoile', 'note', 'stars'],
  commentaire: ['commentaire', 'avis', 'comment', 'texte', 'message'],
}

// « 18/11/2026 » → « 2026-11-18 » ; une date déjà en AAAA-MM-JJ reste telle quelle ; le reste est laissé tel quel (le SQL le rejettera)
function dateIso(texte) {
  const valeur = texte.trim()
  const francais = valeur.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (francais) return `${francais[3]}-${francais[2].padStart(2, '0')}-${francais[1].padStart(2, '0')}`
  return valeur
}

// Texte du fichier → { lignes: [{ date, plat, etoiles, commentaire }], erreur, tronque }
// Avec une ligne d'en-tête, les colonnes sont reconnues par leur nom ; sinon l'ordre est date ; plat ; étoiles ; commentaire.
export function preparerImportAvis(texte) {
  const { lignes, tronque } = lireCsv(texte)
  if (lignes.length === 0) return { lignes: [], erreur: 'Le fichier est vide.', tronque: false }

  const entete = lignes[0].map(normaliserEntete)
  const trouver = (cle) => entete.findIndex((nom) => NOMS_COLONNES[cle].includes(nom))
  const indices = { date: trouver('date'), plat: trouver('plat'), etoiles: trouver('etoiles'), commentaire: trouver('commentaire') }
  const aEntete = indices.date >= 0 && indices.plat >= 0 && indices.etoiles >= 0
  const colonnes = aEntete ? indices : { date: 0, plat: 1, etoiles: 2, commentaire: 3 }
  const donnees = aEntete ? lignes.slice(1) : lignes

  if (!aEntete && lignes[0].length < 3) {
    return { lignes: [], erreur: 'Colonnes attendues : date ; plat ; étoiles ; commentaire.', tronque: false }
  }
  const resultat = donnees.map((cellules) => {
    const brut = (indice) => (indice >= 0 ? (cellules[indice] || '').trim() : '')
    const etoiles = brut(colonnes.etoiles).replace(',', '.')
    return {
      date: dateIso(brut(colonnes.date)),
      plat: brut(colonnes.plat),
      etoiles: etoiles !== '' && !Number.isNaN(Number(etoiles)) ? Math.round(Number(etoiles)) : null,
      commentaire: brut(colonnes.commentaire),
    }
  })
  return { lignes: resultat, erreur: resultat.length === 0 ? 'Aucune ligne d’avis dans le fichier.' : null, tronque }
}

// Envoie les lignes à importer_avis. Renvoie { importes, rejetes: [{ ligne, raison }], erreur }
export async function importerAvisLignes(lignes) {
  const { data, error } = await supabase.rpc('importer_avis', {
    p_lignes: lignes.map((ligne) => ({ ...ligne, commentaire: ligne.commentaire || null })),
  })
  if (error) return { importes: 0, rejetes: [], erreur: traduireErreur(error) }
  return { importes: data.importes, rejetes: data.rejetes || [], erreur: null }
}

// ---------- Export CSV (Excel français) ----------

const COLONNES_CODAGES = [
  { titre: 'Date', cle: 'date_avis' },
  { titre: 'Plat', cle: 'plat' },
  { titre: 'Étoiles', cle: 'etoiles' },
  { titre: 'Commentaire', cle: 'commentaire' },
  { titre: 'Thème', cle: 'theme' },
  { titre: 'Sentiment', cle: 'sentiment' },
  { titre: 'Confiance', cle: 'confiance' },
  { titre: 'Source', cle: 'source' },
  { titre: 'Statut', cle: 'statut' },
]

const COLONNES_SYNTHESE = [
  { titre: 'Thème', cle: 'theme' },
  { titre: 'Avis', cle: 'avis' },
  { titre: '% positif', cle: 'pourcent_positif' },
  { titre: '% négatif', cle: 'pourcent_negatif' },
  { titre: 'Évolution des avis négatifs (%)', cle: 'evolution' },
]

// Deux textes CSV prêts à télécharger : avis_codes.csv (une ligne par codage) et synthese_themes.csv
export async function preparerExports(debut, fin, stats) {
  const { data, error } = await supabase.rpc('export_codages', { p_debut: debut, p_fin: fin })
  if (error) return { erreur: traduireErreur(error) }

  const codages = (data || []).map((ligne) => ({ ...ligne, confiance: Number(ligne.confiance) }))
  const synthese = stats.themes.map((theme) => {
    const total = theme.positif + theme.neutre + theme.negatif
    return {
      theme: theme.libelle,
      avis: theme.avis,
      pourcent_positif: partPourcent(theme.positif, total),
      pourcent_negatif: partPourcent(theme.negatif, total),
      evolution: theme.evolution_negatifs,
    }
  })
  return {
    erreur: null,
    nombreCodages: codages.length,
    avisCodes: ecrireCsv(COLONNES_CODAGES, codages),
    syntheseThemes: ecrireCsv(COLONNES_SYNTHESE, synthese),
  }
}

