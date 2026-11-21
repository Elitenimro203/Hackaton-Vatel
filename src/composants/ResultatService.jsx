// Grand résultat du code de retrait au comptoir : vert « Servi », safran « Déjà servi », rouge « Code inconnu » ou « Pas pour aujourd'hui », avec le rappel des allergies.
import { trouverAllergene } from '../lib/allergenes'
import { formaterCodeRetrait, formaterDate } from '../lib/formatage'

// Valeur renvoyée par marquer_servie() → emoji, titre et couleur
const AFFICHAGES = {
  servi: { emoji: '✅', titre: 'Servi', classe: 'resultat-service resultat-servi' },
  deja_servi: { emoji: '🔁', titre: 'Déjà servi', classe: 'resultat-service resultat-deja-servi' },
  pas_aujourdhui: { emoji: '📅', titre: 'Pas pour aujourd’hui', classe: 'resultat-service resultat-inconnu' },
  inconnu: { emoji: '❌', titre: 'Code inconnu', classe: 'resultat-service resultat-inconnu' },
  refuse: { emoji: '🔒', titre: 'Accès refusé', classe: 'resultat-service resultat-inconnu' },
}

function texteExplication(resultat) {
  if (resultat.resultat === 'pas_aujourdhui') return `Ce ticket est pour le ${formaterDate(resultat.jour)}.`
  if (resultat.resultat === 'inconnu' && resultat.code_retrait) {
    return `${formaterCodeRetrait(resultat.code_retrait)} : vérifie le code avec l’élève.`
  }
  if (resultat.resultat === 'deja_servi') return 'Ce ticket a déjà été utilisé aujourd’hui.'
  if (resultat.resultat === 'servi') return null
  return resultat.message
}

export default function ResultatService({ resultat }) {
  if (!resultat) {
    return (
      <div className="resultat-service" role="status">
        <span className="resultat-emoji" aria-hidden="true">🎟️</span>
        <span className="resultat-titre">En attente</span>
        <p className="resultat-texte">Le résultat du ticket s’affiche ici, en grand.</p>
      </div>
    )
  }

  const affichage = AFFICHAGES[resultat.resultat] || AFFICHAGES.inconnu
  const explication = texteExplication(resultat)
  const allergies = resultat.allergies || []

  return (
    <div className={affichage.classe} role="status" aria-live="assertive">
      <span className="resultat-emoji" aria-hidden="true">{affichage.emoji}</span>
      <span className="resultat-titre">{affichage.titre}</span>
      {resultat.prenom && (
        <strong className="resultat-detail">
          {resultat.prenom} · {resultat.plat}
        </strong>
      )}
      {explication && <p className="resultat-texte">{explication}</p>}

      {allergies.length > 0 && (
        <ul className="rappels-allergie">
          {allergies.map((valeur) => {
            const allergene = trouverAllergene(valeur)
            return (
              <li key={valeur} className="rappel-allergie">
                {allergene.emoji} {allergene.libelle} : assiette adaptée
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
