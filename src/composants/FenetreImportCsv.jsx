// Fenêtre « Importer un CSV » : lecture du fichier dans le navigateur, aperçu des 5 premières lignes, puis importer_avis.
import { useState } from 'react'
import { importerAvisLignes, preparerImportAvis } from '../lib/statsInsights'
import '../insights.css'
import '../allergies.css'

const TAILLE_MAX = 2 * 1024 * 1024

export default function FenetreImportCsv({ afficherToast, onImporte, onFermer }) {
  const [nomFichier, setNomFichier] = useState('')
  const [lignes, setLignes] = useState([])
  const [erreur, setErreur] = useState(null)
  const [tronque, setTronque] = useState(false)
  const [rejetes, setRejetes] = useState([])
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function choisirFichier(evenement) {
    const fichier = evenement.target.files?.[0]
    setLignes([])
    setRejetes([])
    setErreur(null)
    setNomFichier('')
    if (!fichier) return
    if (fichier.size > TAILLE_MAX) {
      setErreur('Fichier trop gros (2 Mo au plus).')
      return
    }
    const texte = await fichier.text()
    const resultat = preparerImportAvis(texte)
    setNomFichier(fichier.name)
    setLignes(resultat.lignes)
    setTronque(resultat.tronque)
    setErreur(resultat.erreur)
  }

  async function importer() {
    setEnvoiEnCours(true)
    const resultat = await importerAvisLignes(lignes)
    setEnvoiEnCours(false)
    if (resultat.erreur) {
      setErreur(resultat.erreur)
      afficherToast(resultat.erreur, 'erreur')
      return
    }
    const mot = (nombre, singulier, pluriel) => `${nombre} ${nombre > 1 ? pluriel : singulier}`
    afficherToast(
      `${mot(resultat.importes, 'avis importé', 'avis importés')}, ${mot(resultat.rejetes.length, 'rejeté', 'rejetés')}`,
      resultat.importes > 0 ? 'succes' : 'erreur',
    )
    if (resultat.rejetes.length > 0) {
      setRejetes(resultat.rejetes)
      setLignes([])
      onImporte(false)
      return
    }
    onImporte(true)
  }

  return (
    <div className="voile">
      <div className="fenetre-bas pile fenetre-insights" role="dialog" aria-modal="true" aria-labelledby="titre-import">
        <div className="espace-entre">
          <span className="surtitre">Importer des avis</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer" disabled={envoiEnCours}>
            ✕
          </button>
        </div>
        <h2 id="titre-import">Importer un CSV</h2>
        <p className="aide">
          Colonnes : date (AAAA-MM-JJ ou JJ/MM/AAAA) ; plat ; étoiles (1 à 5) ; commentaire. Séparateur ; ou , détecté tout seul.
        </p>

        <div className="champ">
          <label htmlFor="fichier-avis">Fichier .csv</label>
          <input id="fichier-avis" type="file" accept=".csv,text/csv,text/plain" onChange={choisirFichier} disabled={envoiEnCours} />
        </div>

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        {lignes.length > 0 && (
          <>
            <p className="aide">
              <strong>{nomFichier}</strong> : {lignes.length} ligne{lignes.length > 1 ? 's' : ''}
              {tronque ? ' (5 000 premières seulement)' : ''}. Aperçu des 5 premières :
            </p>
            <ul className="apercu-import">
              {lignes.slice(0, 5).map((ligne, index) => (
                <li key={index} className="apercu-ligne">
                  <span className="mention">
                    {ligne.date || 'date ?'} · {ligne.plat || 'plat ?'} · {ligne.etoiles ?? '?'} ★
                  </span>
                  <span className="apercu-texte">{ligne.commentaire || 'Pas de commentaire'}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={importer} disabled={envoiEnCours}>
              {envoiEnCours ? 'Import…' : `Importer ${lignes.length} avis`}
            </button>
          </>
        )}

        {rejetes.length > 0 && (
          <div className="alerte alerte-attention" role="status">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>{rejetes.length} ligne{rejetes.length > 1 ? 's' : ''} rejetée{rejetes.length > 1 ? 's' : ''}</strong>
              <ul className="liste-rejets">
                {rejetes.slice(0, 8).map((rejet) => (
                  <li key={rejet.ligne}>Ligne {rejet.ligne} : {rejet.raison}</li>
                ))}
              </ul>
              {rejetes.length > 8 && <p className="mention">… et {rejetes.length - 8} autres.</p>}
              <p className="mention">Les autres lignes sont importées. Le numéro compte les lignes d’avis, sans l’en-tête.</p>
            </div>
          </div>
        )}

        <button type="button" className="btn btn-discret" onClick={onFermer} disabled={envoiEnCours}>
          {rejetes.length > 0 ? 'Fermer' : 'Annuler'}
        </button>
      </div>
    </div>
  )
}
