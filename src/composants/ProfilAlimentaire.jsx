// Grandes tuiles d'allergènes (contour rouge si choisi) et bouton Enregistrer : utilisé par l'élève et par son parent.
import { useEffect, useState } from 'react'
import { ALLERGENES } from '../lib/allergenes'
import { modifierAllergies } from '../lib/allergies'
import '../allergies.css'

function memesAllergies(premiere, seconde) {
  return premiere.length === seconde.length && premiere.every((valeur) => seconde.includes(valeur))
}

// eleve : { id, nom, allergies } ; pourParent : textes au « vous » pour l'espace parent
export default function ProfilAlimentaire({ eleve, afficherToast, onEnregistre, pourParent = false }) {
  const allergiesEnregistrees = eleve.allergies || []
  const [selection, setSelection] = useState(allergiesEnregistrees)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const cleEnregistree = allergiesEnregistrees.join(',')
  const modifie = !memesAllergies(selection, allergiesEnregistrees)
  const prenom = eleve.nom.trim().split(' ')[0] || 'votre enfant'

  // Si les allergies changent ailleurs (parent, autre appareil), les tuiles suivent
  useEffect(() => {
    setSelection(cleEnregistree ? cleEnregistree.split(',') : [])
  }, [cleEnregistree])

  function basculer(valeur) {
    setSelection((anciennes) =>
      anciennes.includes(valeur) ? anciennes.filter((autre) => autre !== valeur) : [...anciennes, valeur],
    )
  }

  async function enregistrer() {
    setEnvoiEnCours(true)
    const erreur = await modifierAllergies(eleve.id, selection)
    setEnvoiEnCours(false)

    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast(pourParent ? `Allergies de ${prenom} enregistrées.` : 'Tes allergies sont enregistrées.')
    if (onEnregistre) onEnregistre()
  }

  return (
    <div className="pile">
      <div className="choix-grille" role="group" aria-label={pourParent ? `Allergies de ${prenom}` : 'Tes allergies'}>
        {ALLERGENES.map((allergene) => {
          const estChoisi = selection.includes(allergene.valeur)
          return (
            <label key={allergene.valeur} className="choix choix-allergie">
              <input type="checkbox" checked={estChoisi} onChange={() => basculer(allergene.valeur)} />
              <span className="choix-allergie-nom">
                <span aria-hidden="true">{allergene.emoji}</span> {allergene.libelle}
              </span>
              <span className="choix-etat">{estChoisi ? '✓ Sélectionné' : 'Non sélectionné'}</span>
            </label>
          )
        })}
      </div>

      <div className="alerte alerte-info alerte-prevenu">
        <span aria-hidden="true">🛡️</span>
        <div>
          <strong>{pourParent ? `${prenom} et la cantine seront prévenus` : 'Ton parent et la cantine seront prévenus'}</strong>
          <p>{pourParent ? 'Chaque plat est vérifié avec ce profil.' : 'Tes allergies viennent toujours de ton profil.'}</p>
        </div>
      </div>

      <button type="button" className="btn btn-enregistrer" onClick={enregistrer} disabled={!modifie || envoiEnCours}>
        {envoiEnCours ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  )
}
