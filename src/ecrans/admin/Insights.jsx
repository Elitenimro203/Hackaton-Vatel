// Onglet admin « Insights » (charte 11.2) : l'IA lit et classe les avis, le SQL compte, l'humain tranche les cas douteux.
// Trois parties : la vedette et le résumé de la semaine, les thèmes avec « Portion et gaspillage », puis la file « À revoir ».
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyserAvis, resumerSemaine } from '../../lib/insights'
import { bornesPeriode, chargerFileRevue, chargerStats, chargerThemes, chiffresPourIa, PERIODES, preparerExports, resumeDeSecours } from '../../lib/statsInsights'
import { telechargerCsv } from '../../lib/csv'
import { dateDuJour, formaterDateAvecAnnee, formaterHeure } from '../../lib/formatage'
import { useTempsReel } from '../../useTempsReel'
import VedetteInsights from '../../composants/VedetteInsights'
import ResumeSemaine from '../../composants/ResumeSemaine'
import CarteTheme from '../../composants/CarteTheme'
import FenetreAvisTheme from '../../composants/FenetreAvisTheme'
import PortionGaspillage from '../../composants/PortionGaspillage'
import FileRevue from '../../composants/FileRevue'
import FenetreImportCsv from '../../composants/FenetreImportCsv'
import Vide from '../../composants/Vide'
import '../../pilotage.css'
import '../../insights.css'

// Le résumé de l'IA est gardé pour la session : même chiffres, même texte, pas de nouvel appel
function lireResumeGarde(cle) {
  try {
    return JSON.parse(window.sessionStorage.getItem(cle))
  } catch {
    return null
  }
}

function garderResume(cle, valeur) {
  try {
    window.sessionStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    // stockage indisponible : le résumé sera simplement redemandé
  }
}

export default function Insights({ afficherToast }) {
  const aujourdhui = dateDuJour()
  const [idPeriode, setIdPeriode] = useState('7')
  const periode = PERIODES.find((option) => option.id === idPeriode)
  const { debut, fin } = bornesPeriode(periode.jours)

  const [stats, setStats] = useState(null)
  const [revue, setRevue] = useState({ codages: [], total: 0 })
  const [listeThemes, setListeThemes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [miseAJour, setMiseAJour] = useState(null)
  const [progres, setProgres] = useState(null)
  const [modeAnalyse, setModeAnalyse] = useState(null)
  const [resume, setResume] = useState({ resume: [], actions: [], source: null, enCours: false })
  const [themeOuvert, setThemeOuvert] = useState(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)
  const demandeResume = useRef(0)

  const charger = useCallback(async () => {
    const [resultatStats, resultatRevue, resultatThemes] = await Promise.all([chargerStats(debut, fin), chargerFileRevue(30), chargerThemes()])
    setListeThemes(resultatThemes.themes)
    setStats(resultatStats.stats)
    setRevue({ codages: resultatRevue.codages, total: resultatRevue.total })
    setErreur(resultatStats.erreur || resultatRevue.erreur)
    setMiseAJour(new Date())
    setChargement(false)
  }, [debut, fin])

  useEffect(() => {
    setChargement(true)
    charger()
  }, [charger])

  // Un avis arrive (appli ou import) : les compteurs se mettent à jour
  useTempsReel('avis', charger)

  // Résumé de la semaine : l'IA reçoit seulement les chiffres calculés en SQL ; sans réponse, on construit la phrase en JavaScript
  useEffect(() => {
    if (!stats || stats.themes.length === 0) {
      setResume({ resume: [], actions: [], source: null, enCours: false })
      return undefined
    }
    const chiffres = chiffresPourIa(stats)
    const cle = `insights-resume:${JSON.stringify(chiffres)}`
    const garde = lireResumeGarde(cle)
    if (garde) {
      setResume({ ...garde, enCours: false })
      return undefined
    }

    const numero = demandeResume.current + 1
    demandeResume.current = numero
    setResume((precedent) => ({ ...precedent, enCours: true }))
    resumerSemaine(chiffres).then((reponse) => {
      if (demandeResume.current !== numero) return
      if (!reponse.erreur && reponse.resume.length > 0) {
        const valeur = { resume: reponse.resume, actions: reponse.actions, source: 'ia' }
        garderResume(cle, valeur)
        setResume({ ...valeur, enCours: false })
      } else {
        setResume({ ...resumeDeSecours(stats), source: 'secours', enCours: false })
      }
    })
    return undefined
  }, [stats])

  async function analyser() {
    setProgres({ fait: 0, total: stats?.avis_sans_codage ?? 0 })
    const bilan = await analyserAvis((fait, total) => setProgres({ fait, total }))
    setProgres(null)
    if (bilan.erreur) {
      afficherToast(bilan.erreur, 'erreur')
    } else if (bilan.total === 0) {
      afficherToast('Tous les avis sont déjà analysés.')
    } else {
      setModeAnalyse(bilan.mode)
      afficherToast(
        bilan.secours
          ? 'L’IA ne répond pas : analyse par mots-clés, à vérifier dans « À revoir ».'
          : `${bilan.total} avis analysés par l’IA.`,
        bilan.secours ? 'erreur' : 'succes',
      )
    }
    charger()
  }

  async function exporter() {
    setExportEnCours(true)
    const fichiers = await preparerExports(debut, fin, stats)
    setExportEnCours(false)
    if (fichiers.erreur) {
      afficherToast(fichiers.erreur, 'erreur')
      return
    }
    telechargerCsv('avis_codes.csv', fichiers.avisCodes)
    telechargerCsv('synthese_themes.csv', fichiers.syntheseThemes)
    afficherToast('Deux fichiers prêts : avis_codes.csv et synthese_themes.csv.')
  }

  function apresImport(fermer) {
    if (fermer) setImportOuvert(false)
    charger()
  }

  // Badge : ce qui vient d'être utilisé, sinon la source majoritaire des codages comptés
  const modeAffiche = modeAnalyse || (stats ? (stats.sources.ia > 0 ? 'ia' : stats.sources.mots_cles > 0 ? 'mots_cles' : null) : null)
  const themesTries = stats ? [...stats.themes].sort((a, b) => b.avis - a.avis) : []

  return (
    <section className="pile pilotage insights">
      <div className="admin-entete">
        <span className="surtitre">Cantine Vatel · Vallon</span>
        <span className="mention premiere-lettre">{formaterDateAvecAnnee(aujourdhui)}</span>
      </div>
      <div>
        <h1 className="admin-titre">Ce que disent les élèves.</h1>
        <p className="aide">
          {stats ? `${stats.avis_total} avis lus` : 'Les avis'}, classés et vérifiés : l’IA lit, le SQL compte, vous tranchez.
        </p>
        {miseAJour && (
          <p className="mention en-direct">
            <span className="point point-feuille" aria-hidden="true" /> En direct · mis à jour à {formaterHeure(miseAJour)}
          </p>
        )}
      </div>

      <div className="insights-periodes" role="group" aria-label="Période analysée">
        {PERIODES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === idPeriode ? 'pilule-periode actif' : 'pilule-periode'}
            aria-pressed={option.id === idPeriode}
            onClick={() => setIdPeriode(option.id)}
            disabled={progres !== null}
          >
            {option.libelle}
          </button>
        ))}
      </div>

      {chargement && (
        <div className="chargement" aria-label="Chargement des avis…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="pile">
          <div className="alerte alerte-erreur" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>Impossible de charger les insights</strong>
              <p>{erreur} Vérifiez que supabase/patch_insights.sql a bien été lancé.</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondaire" onClick={() => { setChargement(true); charger() }}>
            Réessayer
          </button>
        </div>
      )}

      {!chargement && !erreur && stats && (
        <>
          <div className="pilotage-chiffres">
            <VedetteInsights
              stats={stats}
              mode={modeAffiche}
              progres={progres}
              onAnalyser={analyser}
              onImporter={() => setImportOuvert(true)}
              onExporter={exporter}
              exportEnCours={exportEnCours}
            />
            <div className="chiffre pilotage-chiffre chiffre-safran">
              <span className="chiffre-nombre">{stats.note_moyenne === null ? '—' : String(stats.note_moyenne).replace('.', ',')} ★</span>
              <span className="chiffre-libelle">note moyenne</span>
              <span className="mention">Sur {stats.avis_total} avis de la période</span>
            </div>
            <div className="chiffre pilotage-chiffre">
              <span className="chiffre-nombre">{stats.accord_ia_humain === null ? '—' : `${stats.accord_ia_humain} %`}</span>
              <span className="chiffre-libelle">accord IA / humain</span>
              <span className="mention">{stats.valides} validés, {stats.corriges} corrigés</span>
            </div>
          </div>

          <ResumeSemaine resume={resume.resume} actions={resume.actions} source={resume.source} enCours={resume.enCours} />

          <section className="pile" aria-labelledby="titre-themes">
            <h2 id="titre-themes" className="titre-pilotage">Les thèmes</h2>
            {themesTries.length === 0 ? (
              <Vide
                emoji="💬"
                titre="Aucun avis classé sur cette période."
                texte="Lancez « Analyser les nouveaux avis » : l’IA lit et classe chaque avis en quelques secondes."
              />
            ) : (
              <div className="insights-themes">
                {themesTries.map((theme) => (
                  <CarteTheme key={theme.code} theme={theme} onOuvrir={setThemeOuvert} />
                ))}
              </div>
            )}
          </section>

          <div className="insights-bas">
            <PortionGaspillage plats={stats.portion} />
            <FileRevue
              codages={revue.codages}
              total={revue.total}
              themes={listeThemes}
              accord={stats.accord_ia_humain}
              afficherToast={afficherToast}
              onTranche={charger}
            />
          </div>
        </>
      )}

      {themeOuvert && <FenetreAvisTheme theme={themeOuvert} debut={debut} fin={fin} onFermer={() => setThemeOuvert(null)} />}
      {importOuvert && <FenetreImportCsv afficherToast={afficherToast} onImporte={apresImport} onFermer={() => setImportOuvert(false)} />}
    </section>
  )
}
