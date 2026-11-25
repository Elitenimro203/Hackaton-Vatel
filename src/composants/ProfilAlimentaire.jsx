// Formulaire du profil alimentaire, rempli par l'élève ou son parent : les 5 allergènes suivis en tuiles à toucher,
// toute autre allergie écrite librement (avec propositions pendant la frappe), régime en tuiles ou écrit à la main, puis Enregistrer.
import { useState } from 'react'
import { ALLERGENES, reconnaitreAllergene } from '../lib/allergenes'
import { LONGUEUR_MAX_REGIME, REGIMES, REGIME_AUTRE, listerAutresAllergies, regimeEstPersonnel } from '../lib/regimes'
import { modifierProfilAlimentaire } from '../lib/allergies'
import Icone from './Icone'
import '../allergies.css'

const LONGUEUR_MAX_ALLERGIE = 30
const LONGUEUR_MAX_AUTRES = 200
const NOMBRE_MAX_AUTRES = 8
const NOMBRE_PROPOSITIONS = 4

// Allergies fréquentes hors des 5 suivies, proposées pendant la frappe
const ALLERGIES_COURANTES = [
  'Crevettes', 'Crustacés', 'Fruits de mer', 'Sésame', 'Soja', 'Fruits à coque', 'Noix de cajou', 'Kiwi',
  'Ananas', 'Mangue', 'Fraise', 'Tomate', 'Piment', 'Moutarde', 'Céleri', 'Avocat', 'Banane', 'Gombo',
]

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
  const recherche = comparable(saisie)
  const propositions = ALLERGIES_COURANTES.filter(
    (allergie) => !autres.some((autre) => comparable(autre) === comparable(allergie)) && (!recherche || comparable(allergie).includes(recherche)),
  ).slice(0, NOMBRE_PROPOSITIONS)
  const modifie =
    !memesListes(connus, connusEnregistres) ||
    autres.join(', ') !== autresEnregistrees.join(', ') ||
    regimeAEnregistrer(choixRegime, regimeLibre) !== regimeEnregistre

  function ajouterConnu(valeur) {
    setConnus((anciens) => (anciens.includes(valeur) ? anciens : [...anciens, valeur]))
  }

  function basculerConnu(valeur) {
    setConnus((anciens) => (anciens.includes(valeur) ? anciens.filter((autre) => autre !== valeur) : [...anciens, valeur]))
  }

  // Ajoute ce qui est tapé : un des 5 allergènes suivis s'il est reconnu (« cacahuètes » → Arachide), sinon une allergie libre
  function ajouterSaisie(texteChoisi = saisie) {
    const brut = texteChoisi.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
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

  const texteBouton = modifie ? 'Enregistrer' : 'Rien à enregistrer'

  return (
    <form className="pile formulaire-profil" onSubmit={enregistrer} noValidate>
      <fieldset className="pile groupe-profil" disabled={envoiEnCours}>
        <legend className="sous-titre">{pourParent ? 'Ses allergies' : 'Tes allergies'}</legend>
        <p className="aide">Touche ce qui {pourParent ? 'le' : 'te'} concerne. La cantine vérifie ces 5 allergènes sur chaque plat.</p>
        <div className="choix-grille">
          {ALLERGENES.map((allergene) => {
            const estChoisi = connus.includes(allergene.valeur)
            return (
              <label key={allergene.valeur} className="choix choix-allergie">
                <input type="checkbox" checked={estChoisi} onChange={() => basculerConnu(allergene.valeur)} />
                <span className="choix-allergie-nom">
                  <Icone nom={allergene.icone} /> {allergene.libelle}
                </span>
                <span className="choix-etat">
                  {estChoisi && <Icone nom="coche" />}
                  {estChoisi ? 'Allergique' : 'Non'}
                </span>
              </label>
            )
          })}
        </div>

        <div className={erreurSaisie ? 'champ champ-erreur' : 'champ'}>
          <label htmlFor={`ajout-allergie-${eleve.id}`}>Une autre allergie ?</label>
          <div className="champ-ajout">
            <input
              id={`ajout-allergie-${eleve.id}`}
              type="text"
              maxLength={LONGUEUR_MAX_ALLERGIE}
              placeholder="Écris-la : crevettes, kiwi…"
              value={saisie}
              onChange={(e) => {
                setSaisie(e.target.value)
                setErreurSaisie(null)
              }}
              onKeyDown={surToucheSaisie}
              autoComplete="off"
              enterKeyHint="done"
            />
            <button type="button" className="btn btn-secondaire btn-ajouter" onClick={() => ajouterSaisie()} disabled={!saisie.trim()}>
              Ajouter
            </button>
          </div>
          {erreurSaisie && <span className="champ-message">{erreurSaisie}</span>}
        </div>

        {propositions.length > 0 && (
          <div className="suggestions" role="group" aria-label="Propositions">
            {propositions.map((allergie) => (
              <button key={allergie} type="button" className="suggestion" onClick={() => ajouterSaisie(allergie)}>
                <Icone nom="plus" />
                {allergie}
              </button>
            ))}
          </div>
        )}

        {autres.length > 0 && (
          <ul className="etiquettes" aria-label="Autres allergies déclarées">
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
      </fieldset>

      <fieldset className="pile groupe-profil" disabled={envoiEnCours}>
        <legend className="sous-titre">{pourParent ? 'Son régime' : 'Ton régime'}</legend>
        <div className="choix-grille">
          {REGIMES.map((regime) => (
            <label key={regime.valeur} className="choix choix-safran">
              <input
                type="radio"
                name={`regime-${eleve.id}`}
                value={regime.valeur}
                checked={choixRegime === regime.valeur}
                onChange={() => {
                  setChoixRegime(regime.valeur)
                  setErreurRegime(null)
                }}
              />
              <Icone nom={regime.icone} className="choix-icone" />
              {regime.libelle}
              <span className="choix-detail">{regime.detail}</span>
            </label>
          ))}
          <label className="choix choix-safran choix-large">
            <input
              type="radio"
              name={`regime-${eleve.id}`}
              value={REGIME_AUTRE}
              checked={choixRegime === REGIME_AUTRE}
              onChange={() => setChoixRegime(REGIME_AUTRE)}
            />
            <Icone nom="crayon" className="choix-icone" />
            Autre régime
            <span className="choix-detail">{regimeLibre.trim() || 'Je l’écris moi-même'}</span>
          </label>
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
              onChange={(e) => {
                setRegimeLibre(e.target.value)
                setErreurRegime(null)
              }}
              autoFocus
            />
            <span className="champ-message">
              {erreurRegime || 'La cuisine le voit, et l’appli te prévient quand un plat semble ne pas convenir.'}
            </span>
          </div>
        )}
      </fieldset>

      <div className="barre-enregistrer">
        <p className="mention centre">
          <Icone nom="bouclier" className="icone-feuille" />{' '}
          {pourParent ? `${prenom} et la cantine seront prévenus.` : 'Ton parent et la cantine seront prévenus.'}
        </p>
        <button type="submit" className="btn btn-enregistrer" disabled={!modifie || envoiEnCours}>
          {envoiEnCours ? 'Enregistrement…' : texteBouton}
        </button>
      </div>
    </form>
  )
}
