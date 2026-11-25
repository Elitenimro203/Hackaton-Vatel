// Profil alimentaire rempli par l'élève ou son parent : allergènes en grandes tuiles, régime, autre allergie en texte libre, et Enregistrer.
import { useEffect, useState } from 'react'
import { ALLERGENES } from '../lib/allergenes'
import { REGIMES } from '../lib/regimes'
import { modifierProfilAlimentaire } from '../lib/allergies'
import Icone from './Icone'
import '../allergies.css'

const LONGUEUR_MAX_AUTRE = 60

function memesAllergies(premiere, seconde) {
  return premiere.length === seconde.length && premiere.every((valeur) => seconde.includes(valeur))
}

// eleve : { id, nom, allergies, regime, autre_allergie } ; pourParent : textes au « vous » pour l'espace parent
export default function ProfilAlimentaire({ eleve, afficherToast, onEnregistre, pourParent = false }) {
  const allergiesEnregistrees = eleve.allergies || []
  const regimeEnregistre = eleve.regime || 'aucun'
  const autreEnregistree = eleve.autre_allergie || ''
  const [selection, setSelection] = useState(allergiesEnregistrees)
  const [regime, setRegime] = useState(regimeEnregistre)
  const [autreAllergie, setAutreAllergie] = useState(autreEnregistree)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const cleEnregistree = `${allergiesEnregistrees.join(',')}|${regimeEnregistre}|${autreEnregistree}`
  const modifie =
    !memesAllergies(selection, allergiesEnregistrees) || regime !== regimeEnregistre || autreAllergie.trim() !== autreEnregistree
  const prenom = eleve.nom.trim().split(' ')[0] || 'votre enfant'

  // Si le profil change ailleurs (parent, autre appareil), le formulaire suit
  useEffect(() => {
    const [allergies, regimeBase, autreBase] = cleEnregistree.split('|')
    setSelection(allergies ? allergies.split(',') : [])
    setRegime(regimeBase)
    setAutreAllergie(autreBase)
  }, [cleEnregistree])

  function basculer(valeur) {
    setSelection((anciennes) =>
      anciennes.includes(valeur) ? anciennes.filter((autre) => autre !== valeur) : [...anciennes, valeur],
    )
  }

  async function enregistrer() {
    setEnvoiEnCours(true)
    const erreur = await modifierProfilAlimentaire(eleve.id, {
      allergies: selection,
      regime,
      autreAllergie: autreAllergie.trim(),
    })
    setEnvoiEnCours(false)

    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast(pourParent ? `Profil de ${prenom} enregistré.` : 'Ton profil est enregistré.')
    if (onEnregistre) onEnregistre()
  }

  return (
    <div className="pile">
      <h3 className="sous-titre">{pourParent ? 'Ses allergies' : 'Tes allergies'}</h3>
      <div className="choix-grille" role="group" aria-label={pourParent ? `Allergies de ${prenom}` : 'Tes allergies'}>
        {ALLERGENES.map((allergene) => {
          const estChoisi = selection.includes(allergene.valeur)
          return (
            <label key={allergene.valeur} className="choix choix-allergie">
              <input type="checkbox" checked={estChoisi} onChange={() => basculer(allergene.valeur)} disabled={envoiEnCours} />
              <span className="choix-allergie-nom">
                <Icone nom={allergene.icone} /> {allergene.libelle}
              </span>
              <span className="choix-etat">{estChoisi && <Icone nom="coche" />}
                {estChoisi ? 'Sélectionné' : 'Non sélectionné'}</span>
            </label>
          )
        })}
      </div>

      <div className={autreAllergie.length > LONGUEUR_MAX_AUTRE ? 'champ champ-erreur' : 'champ'}>
        <label htmlFor={`autre-allergie-${eleve.id}`}>Autre allergie</label>
        <input
          id={`autre-allergie-${eleve.id}`}
          type="text"
          maxLength={LONGUEUR_MAX_AUTRE}
          placeholder="Crevettes, kiwi…"
          value={autreAllergie}
          onChange={(e) => setAutreAllergie(e.target.value)}
          disabled={envoiEnCours}
        />
        <span className="champ-message">Facultatif. La cuisine la verra sur sa liste du jour.</span>
      </div>

      <h3 className="sous-titre" id={`titre-regime-${eleve.id}`}>{pourParent ? 'Son régime' : 'Ton régime'}</h3>
      <div className="choix-grille" role="radiogroup" aria-labelledby={`titre-regime-${eleve.id}`}>
        {REGIMES.map((unRegime) => (
          <label key={unRegime.valeur} className="choix choix-safran">
            <input
              type="radio"
              name={`regime-${eleve.id}`}
              value={unRegime.valeur}
              checked={regime === unRegime.valeur}
              onChange={() => setRegime(unRegime.valeur)}
              disabled={envoiEnCours}
            />
            <Icone nom={unRegime.icone} className="choix-icone" />
            {unRegime.libelle}
            <span className="choix-detail">{unRegime.detail}</span>
          </label>
        ))}
      </div>

      <div className="alerte alerte-info alerte-prevenu">
        <Icone nom="bouclier" />
        <div>
          <strong>{pourParent ? `${prenom} et la cantine seront prévenus` : 'Ton parent et la cantine seront prévenus'}</strong>
          <p>{pourParent ? 'Chaque plat est vérifié avec ce profil.' : 'Chaque plat est comparé à tes allergies et à ton régime.'}</p>
        </div>
      </div>

      <button type="button" className="btn btn-enregistrer" onClick={enregistrer} disabled={!modifie || envoiEnCours}>
        {envoiEnCours ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  )
}
