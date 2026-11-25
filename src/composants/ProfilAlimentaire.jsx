// Formulaire du profil alimentaire, rempli par l'élève ou son parent : allergies écrites librement (étiquettes à ajouter ou retirer),
// raccourcis pour les 5 allergènes suivis, régime proposé ou écrit à la main, puis Enregistrer.
import { useState } from 'react'
import { ALLERGENES, reconnaitreAllergene, trouverAllergene } from '../lib/allergenes'
import { LONGUEUR_MAX_REGIME, REGIMES, REGIME_AUTRE, listerAutresAllergies, regimeEstPersonnel } from '../lib/regimes'
import { modifierProfilAlimentaire } from '../lib/allergies'
import Icone from './Icone'
import '../allergies.css'

const LONGUEUR_MAX_ALLERGIE = 30
const LONGUEUR_MAX_AUTRES = 200
const NOMBRE_MAX_AUTRES = 8

function memesListes(premiere, seconde) {
  return premiere.length === seconde.length && premiere.every((valeur) => seconde.includes(valeur))
}

function comparable(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// « halal » écrit à la main redevient le régime proposé « halal » (la cantine sait le vérifier)
function regimeAEnregistrer(choix, texteLibre) {
  if (choix !== REGIME_AUTRE) return choix
  const propose = REGIMES.find((regime) => [regime.valeur, regime.libelle].some((nom) => comparable(nom) === comparable(texteLibre)))
  return propose ? propose.valeur : texteLibre.trim()
}

// eleve : { id, nom, allergies, regime, autre_allergie } ; pourParent : textes pour l'espace parent ; onFermer : après Enregistrer ou Annuler
export default function ProfilAlimentaire({ eleve, afficherToast, onEnregistre, onFermer, pourParent = false }) {
  const connusEnregistres = eleve.allergies || []
  const autresEnregistrees = listerAutresAllergies(eleve.autre_allergie)
  const regimeEnregistre = eleve.regime || 'aucun'
  const [connus, setConnus] = useState(connusEnregistres)
  const [autres, setAutres] = useState(autresEnregistrees)
  const [saisie, setSaisie] = useState('')
  const [erreurSaisie, setErreurSaisie] = useState(null)
  const [choixRegime, setChoixRegime] = useState(regimeEstPersonnel(regimeEnregistre) ? REGIME_AUTRE : regimeEnregistre)
  const [regimeLibre, setRegimeLibre] = useState(regimeEstPersonnel(regimeEnregistre) ? regimeEnregistre : '')
  const [erreurRegime, setErreurRegime] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const prenom = eleve.nom.trim().split(' ')[0] || 'votre enfant'
  const suggestions = ALLERGENES.filter((allergene) => !connus.includes(allergene.valeur))
  const modifie =
    !memesListes(connus, connusEnregistres) ||
    autres.join(', ') !== autresEnregistrees.join(', ') ||
    regimeAEnregistrer(choixRegime, regimeLibre) !== regimeEnregistre

  function ajouterConnu(valeur) {
    setConnus((anciens) => (anciens.includes(valeur) ? anciens : [...anciens, valeur]))
  }

  // Ajoute ce qui est tapé : un des 5 allergènes suivis s'il est reconnu (« cacahuètes » → Arachide), sinon une allergie libre
  function ajouterSaisie() {
    const brut = saisie.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
    const texte = brut.charAt(0).toUpperCase() + brut.slice(1)
    if (!texte) return
    const connu = reconnaitreAllergene(texte)
    if (connu) {
      ajouterConnu(connu)
    } else if (autres.some((autre) => comparable(autre) === comparable(texte))) {
      setErreurSaisie(null)
    } else if (autres.length >= NOMBRE_MAX_AUTRES) {
      setErreurSaisie(`${NOMBRE_MAX_AUTRES} allergies libres au plus. Retire-en une pour en ajouter une autre.`)
      return
    } else if ([...autres, texte].join(', ').length > LONGUEUR_MAX_AUTRES) {
      setErreurSaisie('La liste est trop longue. Raccourcis une allergie.')
      return
    } else {
      setAutres((anciennes) => [...anciennes, texte])
    }
    setErreurSaisie(null)
    setSaisie('')
  }

  function surToucheSaisie(evenement) {
    if (evenement.key === 'Enter') {
      evenement.preventDefault()
      ajouterSaisie()
    }
  }

  async function enregistrer(evenement) {
    evenement.preventDefault()
    if (choixRegime === REGIME_AUTRE && !regimeLibre.trim()) {
      setErreurRegime('Écris le régime, par exemple « Sans gluten » ou « Pas de bœuf ».')
      return
    }
    setErreurRegime(null)
    setEnvoiEnCours(true)
    const erreur = await modifierProfilAlimentaire(eleve.id, {
      allergies: connus,
      regime: regimeAEnregistrer(choixRegime, regimeLibre),
      autreAllergie: autres.join(', '),
    })
    setEnvoiEnCours(false)

    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast(pourParent ? `Profil de ${prenom} enregistré.` : 'Ton profil est enregistré.')
    if (onEnregistre) onEnregistre()
    if (onFermer) onFermer()
  }

  const rien = connus.length === 0 && autres.length === 0

  return (
    <form className="pile formulaire-profil" onSubmit={enregistrer} noValidate>
      <fieldset className="pile groupe-profil" disabled={envoiEnCours}>
        <legend className="sous-titre">{pourParent ? 'Ses allergies' : 'Tes allergies'}</legend>

        {rien ? (
          <p className="aide">Aucune allergie déclarée pour l’instant.</p>
        ) : (
          <ul className="etiquettes" aria-label="Allergies déclarées">
            {connus.map((valeur) => {
              const allergene = trouverAllergene(valeur)
              return (
                <li key={valeur} className="etiquette">
                  <Icone nom={allergene.icone} />
                  {allergene.libelle}
                  <button
                    type="button"
                    className="etiquette-retirer"
                    onClick={() => setConnus((anciens) => anciens.filter((autre) => autre !== valeur))}
                    aria-label={`Retirer ${allergene.libelle}`}
                  >
                    <Icone nom="fermer" />
                  </button>
                </li>
              )
            })}
            {autres.map((allergie) => (
              <li key={allergie} className="etiquette">
                <Icone nom="alerte" />
                {allergie}
                <button
                  type="button"
                  className="etiquette-retirer"
                  onClick={() => setAutres((anciennes) => anciennes.filter((autre) => autre !== allergie))}
                  aria-label={`Retirer ${allergie}`}
                >
                  <Icone nom="fermer" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={erreurSaisie ? 'champ champ-erreur' : 'champ'}>
          <label htmlFor={`ajout-allergie-${eleve.id}`}>Ajouter une allergie</label>
          <div className="champ-ajout">
            <input
              id={`ajout-allergie-${eleve.id}`}
              type="text"
              maxLength={LONGUEUR_MAX_ALLERGIE}
              placeholder="Crevettes, kiwi, sésame…"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={surToucheSaisie}
              autoComplete="off"
            />
            <button type="button" className="btn btn-secondaire btn-ajouter" onClick={ajouterSaisie} disabled={!saisie.trim()}>
              Ajouter
            </button>
          </div>
          <span className="champ-message">
            {erreurSaisie || 'Écris ce que tu veux, une allergie à la fois. La cuisine la verra sur sa liste du jour.'}
          </span>
        </div>

        {suggestions.length > 0 && (
          <div className="suggestions" role="group" aria-label="Allergies fréquentes">
            <span className="mention">Fréquentes :</span>
            {suggestions.map((allergene) => (
              <button key={allergene.valeur} type="button" className="suggestion" onClick={() => ajouterConnu(allergene.valeur)}>
                <Icone nom="plus" />
                {allergene.libelle}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="pile groupe-profil" disabled={envoiEnCours}>
        <legend className="sous-titre">{pourParent ? 'Son régime' : 'Ton régime'}</legend>
        <div className="champ">
          <label htmlFor={`regime-${eleve.id}`}>Régime alimentaire</label>
          <select
            id={`regime-${eleve.id}`}
            value={choixRegime}
            onChange={(e) => {
              setChoixRegime(e.target.value)
              setErreurRegime(null)
            }}
          >
            {REGIMES.map((regime) => (
              <option key={regime.valeur} value={regime.valeur}>
                {regime.libelle} ({regime.detail.toLowerCase()})
              </option>
            ))}
            <option value={REGIME_AUTRE}>Autre, je l’écris</option>
          </select>
        </div>

        {choixRegime === REGIME_AUTRE && (
          <div className={erreurRegime ? 'champ champ-erreur' : 'champ'}>
            <label htmlFor={`regime-libre-${eleve.id}`}>{pourParent ? 'Son régime, en quelques mots' : 'Ton régime, en quelques mots'}</label>
            <input
              id={`regime-libre-${eleve.id}`}
              type="text"
              maxLength={LONGUEUR_MAX_REGIME}
              placeholder="Sans gluten, pas de bœuf…"
              value={regimeLibre}
              onChange={(e) => setRegimeLibre(e.target.value)}
            />
            <span className="champ-message">
              {erreurRegime || 'La cuisine le voit, et l’appli te prévient quand un plat semble ne pas convenir.'}
            </span>
          </div>
        )}
      </fieldset>

      <div className="alerte alerte-info alerte-prevenu">
        <Icone nom="bouclier" />
        <div>
          <strong>{pourParent ? `${prenom} et la cantine seront prévenus` : 'Ton parent et la cantine seront prévenus'}</strong>
          <p>{pourParent ? 'Chaque plat est vérifié avec ce profil.' : 'Chaque plat est comparé à tes allergies et à ton régime.'}</p>
        </div>
      </div>

      <div className="pile actions-profil">
        <button type="submit" className="btn btn-enregistrer" disabled={!modifie || envoiEnCours}>
          {envoiEnCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {onFermer && (
          <button type="button" className="btn btn-discret" onClick={onFermer} disabled={envoiEnCours}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
