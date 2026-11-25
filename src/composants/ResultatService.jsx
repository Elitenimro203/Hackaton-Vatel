// Grand résultat du code de retrait au comptoir : vert « Servi », safran « Déjà servi », rouge « Code inconnu » ou « Pas pour aujourd'hui », avec le rappel des allergies.
import { trouverAllergene } from '../lib/allergenes'
import { formaterCodeRetrait, formaterDate } from '../lib/formatage'
import Icone from './Icone'

// Valeur renvoyée par marquer_servie() → icône, titre et couleur
const AFFICHAGES = {
  servi: { icone: 'coche-ronde', titre: 'Servi', classe: 'resultat-service resultat-servi' },
  deja_servi: { icone: 'remplacement', titre: 'Déjà servi', classe: 'resultat-service resultat-deja-servi' },
  pas_aujourdhui: { icone: 'calendrier-barre', titre: 'Pas pour aujourd’hui', classe: 'resultat-service resultat-inconnu' },
  inconnu: { icone: 'croix-ronde', titre: 'Code inconnu', classe: 'resultat-service resultat-inconnu' },
  refuse: { icone: 'cadenas', titre: 'Accès refusé', classe: 'resultat-service resultat-inconnu' },
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
        <Icone nom="ticket" className="resultat-icone" />
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
      <Icone nom={affichage.icone} className="resultat-icone" />
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
                <Icone nom={allergene.icone} /> {allergene.libelle} : assiette adaptée
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
