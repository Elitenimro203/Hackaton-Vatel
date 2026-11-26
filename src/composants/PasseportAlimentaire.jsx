// Passeport alimentaire : allergies et régime du convive, dans le même style que la carte cantine (halo, guillochis, sceau).
// Sur le profil, toute la carte ouvre le formulaire ; dans le formulaire, un aperçu compact qui suit ce qu'on touche.
import { trouverAllergene } from '../lib/allergenes'
import { trouverRegime } from '../lib/regimes'
import Icone from './Icone'

const NOMBRE_DANS_LE_TITRE = 3

function majuscule(texte) {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

// « Sans arachide, kiwi et crevettes. », « Sans arachide, lait, kiwi +2. » ou « Tout me va. »
function titreDuPasseport(noms) {
  if (noms.length === 0) return 'Tout me va.'
  const minuscules = noms.map((nom) => nom.toLowerCase())
  if (minuscules.length > NOMBRE_DANS_LE_TITRE) {
    return `Sans ${minuscules.slice(0, NOMBRE_DANS_LE_TITRE).join(', ')} +${minuscules.length - NOMBRE_DANS_LE_TITRE}.`
  }
  if (minuscules.length === 1) return `Sans ${minuscules[0]}.`
  return `Sans ${minuscules.slice(0, -1).join(', ')} et ${minuscules[minuscules.length - 1]}.`
}

// allergies : valeurs des 5 allergènes suivis ; autres : allergies écrites à la main ; regime : valeur ou texte libre
export default function PasseportAlimentaire({ nom, allergies = [], autres = [], regime = 'aucun', compact = false, onModifier }) {
  const connus = allergies.map(trouverAllergene)
  const noms = [...connus.map((allergene) => allergene.libelle), ...autres.map(majuscule)]
  const aUnRegime = Boolean(regime) && regime !== 'aucun'
  const infoRegime = trouverRegime(regime)
  const aSurveiller = noms.length > 0
  const classes = ['passeport', aSurveiller ? 'passeport-alerte' : 'passeport-ok', compact && 'passeport-compact', onModifier && 'passeport-bouton']
    .filter(Boolean)
    .join(' ')

  const contenu = (
    <>
      <span className="carte-cantine-motif" aria-hidden="true" />

      <span className="passeport-haut">
        <span className="passeport-surtitre">Passeport alimentaire</span>
        <span className="passeport-sceau" aria-hidden="true">
          <Icone nom={aSurveiller ? 'alerte' : 'bouclier'} />
        </span>
      </span>

      <span className="passeport-titre">{titreDuPasseport(noms)}</span>

      <span className="passeport-pastilles">
        {connus.map((allergene) => (
          <span key={allergene.valeur} className="passeport-pastille passeport-pastille-allergie">
            <Icone nom={allergene.icone} />
            {allergene.libelle}
          </span>
        ))}
        {autres.map((allergie) => (
          <span key={allergie} className="passeport-pastille passeport-pastille-allergie">
            <Icone nom="alerte" />
            {majuscule(allergie)}
          </span>
        ))}
        {aUnRegime && (
          <span className="passeport-pastille passeport-pastille-regime">
            <Icone nom={infoRegime.icone} />
            {infoRegime.libelle}
          </span>
        )}
        {!aSurveiller && !aUnRegime && (
          <span className="passeport-pastille passeport-pastille-ok">
            <Icone nom="coche" />
            Aucune allergie · pas de régime
          </span>
        )}
      </span>

      {!compact && (
        <span className="passeport-bas">
          <span className="passeport-identite">
            <span className="carte-cantine-libelle">Titulaire</span>
            <span className="passeport-nom">{nom || 'Convive'}</span>
          </span>
          {onModifier && (
            <span className="passeport-modifier">
              <Icone nom="crayon" />
              Modifier
            </span>
          )}
        </span>
      )}
    </>
  )

  if (onModifier) {
    return (
      <button type="button" className={classes} onClick={onModifier} aria-haspopup="dialog" aria-label={`Passeport alimentaire : ${noms.join(', ') || 'aucune allergie'}. Modifier`}>
        {contenu}
      </button>
    )
  }
  return (
    <div className={classes} aria-live="polite">
      {contenu}
    </div>
  )
}
