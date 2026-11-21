// Onglet Menu de l'élève : la semaine jour par jour, ses allergies mises en évidence, et l'ouverture de la fiche pour réserver.
import { useCallback, useEffect, useState } from 'react'
import { chargerMenusEntre, prixPourProfil } from '../lib/menus'
import { chargerMesReservations, reservationFermee } from '../lib/reservations'
import { allergenesARisque, alternativeCompatible, decrireAllergenes } from '../lib/allergenes'
import {
  dateDuJour,
  formaterDate,
  formaterDateCourte,
  formaterJourCourt,
  formaterMontant,
  formaterNumeroJour,
  joursOuvresDeLaSemaine,
} from '../lib/formatage'
import { useTempsReel } from '../useTempsReel'
import BadgesAllergenes from '../composants/BadgesAllergenes'
import '../menus.css'
import NavigationSemaine from '../composants/NavigationSemaine'
import PhotoPlat from '../composants/PhotoPlat'
import Vide from '../composants/Vide'

function classeDuJour(menu, estActif, allergies) {
  const classes = ['jour']
  if (menu) classes.push(allergenesARisque(menu.allergenes, allergies).length > 0 ? 'jour-risque' : 'jour-ok')
  if (estActif) classes.push('actif')
  return classes.join(' ')
}

// Jour affiché au départ : aujourd'hui en semaine, sinon le lundi qui vient
function jourDeDepart(aujourdhui) {
  const jours = joursOuvresDeLaSemaine(aujourdhui)
  return jours.includes(aujourdhui) ? aujourdhui : jours[0]
}

export default function MenuSemaine({ profil, onOuvrirPlat, onVoirReservations }) {
  const aujourdhui = dateDuJour()
  const [jourChoisi, setJourChoisi] = useState(() => jourDeDepart(aujourdhui))
  const [menus, setMenus] = useState([])
  const [reservations, setReservations] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const allergies = profil.allergies || []
  const joursSemaine = joursOuvresDeLaSemaine(jourChoisi)
  const lundi = joursSemaine[0]
  const vendredi = joursSemaine[4]

  const charger = useCallback(async () => {
    const resultatMenus = await chargerMenusEntre(lundi, vendredi)
    const resultatReservations = await chargerMesReservations(profil.id, resultatMenus.menus.map((menu) => menu.id))
    setMenus(resultatMenus.menus)
    setReservations(resultatReservations.reservations)
    setErreur(resultatMenus.erreur || resultatReservations.erreur)
    setChargement(false)
  }, [lundi, vendredi, profil.id])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('menus', charger)
  useTempsReel('reservations', charger, `eleve_id=eq.${profil.id}`)

  const menuDuJour = menus.find((menu) => menu.jour === jourChoisi)
  const risques = menuDuJour ? allergenesARisque(menuDuJour.allergenes, allergies) : []
  const estReserve = Boolean(menuDuJour && reservations.some((resa) => resa.menu_id === menuDuJour.id))
  const prix = menuDuJour ? prixPourProfil(menuDuJour, profil) : 0

  function changerSemaine(nouveauLundi) {
    setChargement(true)
    setJourChoisi(nouveauLundi)
  }

  function boutonPrincipal() {
    if (estReserve) {
      return (
        <button type="button" className="btn" onClick={onVoirReservations}>
          Voir ma réservation
        </button>
      )
    }
    if (reservationFermee(menuDuJour.jour)) {
      return (
        <button type="button" className="btn btn-secondaire" disabled>
          Réservations fermées pour ce jour
        </button>
      )
    }
    return (
      <button type="button" className="btn" onClick={() => onOuvrirPlat(menuDuJour)}>
        Réserver ce régal
        <span className="btn-prix">{formaterMontant(prix)}</span>
      </button>
    )
  }

  return (
    <section className="pile">
      <h1>À chaque jour, son bonheur.</h1>
      <NavigationSemaine lundi={lundi} onChanger={changerSemaine} classeTitre="texte-safran" />

      <div className="jours" role="group" aria-label="Jours de la semaine">
        {joursSemaine.map((jour) => {
          const menu = menus.find((unMenu) => unMenu.jour === jour)
          return (
            <button
              key={jour}
              type="button"
              className={classeDuJour(menu, jour === jourChoisi, allergies)}
              aria-pressed={jour === jourChoisi}
              aria-label={formaterDate(jour)}
              onClick={() => setJourChoisi(jour)}
            >
              <span className="jour-nom">{formaterJourCourt(jour)}</span>
              <span className="jour-numero">{formaterNumeroJour(jour)}</span>
            </button>
          )
        })}
      </div>
      <p className="aide">Réserve la veille à 18 h au plus tard.</p>

      {chargement && (
        <div className="chargement" aria-label="Chargement du menu…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            <strong>Impossible de charger le menu</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && !menuDuJour && (
        <Vide
          emoji="📅"
          titre="Pas encore de menu ce jour-là"
          texte="La cantine prépare la suite. Regarde un autre jour."
          libelleBouton={jourChoisi === lundi ? undefined : '← Voir lundi'}
          onAction={() => setJourChoisi(lundi)}
        />
      )}

      {!chargement && menuDuJour && (
        <article className={risques.length > 0 && !estReserve ? 'carte-menu carte-deconseillee' : 'carte-menu'}>
          <PhotoPlat adresse={menuDuJour.photo_url} nomPlat={menuDuJour.plat} vivante>
            <span className="pastille pastille-verre coin-haut texte-safran">{formaterDateCourte(menuDuJour.jour)}</span>
            {estReserve && <span className="badge badge-succes coin-droite">✓ Réservé</span>}
            {!estReserve && risques.length > 0 && <span className="pastille pastille-danger coin-droite">⚠ Pas pour toi</span>}
            {!estReserve && risques.length > 0 && (
              <span className="pastille pastille-danger coin-bas">{decrireAllergenes(risques)}</span>
            )}
          </PhotoPlat>
          <div className="carte-menu-corps pile">
            <h2 className="nom-plat nom-plat-grand">{menuDuJour.plat}</h2>
            <div>
              {menuDuJour.entree && <p className="aide">Entrée · {menuDuJour.entree}</p>}
              {menuDuJour.dessert && <p className="aide">Dessert · {menuDuJour.dessert}</p>}
            </div>
            <div className="espace-entre">
              <BadgesAllergenes allergenes={menuDuJour.allergenes} allergiesProfil={allergies} />
              <span className="prix prix-grand texte-safran">{formaterMontant(prix)}</span>
            </div>
            {risques.length > 0 && (
              <p className="mention-danger">⚠ Contient {decrireAllergenes(risques)}, noté dans ton profil.</p>
            )}
            {risques.length > 0 && alternativeCompatible(menuDuJour, allergies) && (
              <p className="aide">🔄 Plat de remplacement pour toi : {menuDuJour.plat_alternatif}</p>
            )}
            {boutonPrincipal()}
          </div>
        </article>
      )}

    </section>
  )
}
