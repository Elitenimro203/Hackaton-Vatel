// Carte vedette « Ce que disent les élèves » : avis analysés sur le total, jauge de progression, boutons d'analyse, d'import et d'export, badge du mode d'analyse.
import { formaterNombre } from '../lib/formatage'

const BADGES_MODE = {
  ia: { libelle: 'Analyse IA', classe: 'badge badge-attention' },
  mots_cles: { libelle: 'Mode secours : mots-clés', classe: 'badge badge-neutre' },
  mixte: { libelle: 'Analyse IA + mots-clés', classe: 'badge badge-attention' },
}

export default function VedetteInsights({ stats, mode, progres, onAnalyser, onImporter, onExporter, exportEnCours }) {
  const enCours = progres !== null
  const analyses = enCours ? progres.fait : stats.avis_analyses
  const total = enCours ? progres.total : stats.avis_total
  const badge = BADGES_MODE[mode]

  return (
    <div className="carte-vedette pilotage-vedette insights-vedette">
      <div className="espace-entre insights-surtitre">
        <span className="surtitre">Ce que disent les élèves</span>
        {badge && <span className={badge.classe}>{badge.libelle}</span>}
      </div>

      <span className="chiffre-vedette pilotage-compteur">
        {formaterNombre(analyses)}
        <small>/ {formaterNombre(total)}</small>
      </span>
      <p className="vedette-repas">
        <strong>{enCours ? 'avis en cours d’analyse…' : 'avis analysés'}</strong>
        {!enCours && stats.avis_sans_codage > 0 && ` · ${formaterNombre(stats.avis_sans_codage)} à analyser`}
      </p>

      <progress
        className="jauge jauge-bas"
        value={analyses}
        max={Math.max(total, 1)}
        aria-label={`${analyses} avis analysés sur ${total}`}
      />

      <div className="insights-actions">
        <button type="button" className="btn" onClick={onAnalyser} disabled={enCours}>
          {enCours ? 'Analyse en cours…' : 'Analyser les nouveaux avis'}
        </button>
        <button type="button" className="btn btn-discret" onClick={onImporter} disabled={enCours}>
          Importer un CSV
        </button>
        <button type="button" className="btn btn-discret" onClick={onExporter} disabled={enCours || exportEnCours}>
          {exportEnCours ? 'Préparation…' : 'Exporter vers le tableur'}
        </button>
      </div>
    </div>
  )
}
