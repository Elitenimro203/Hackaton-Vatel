// Onglet Menu de l'élève : la semaine jour par jour, les plats au choix de chaque jour (ceux qui lui vont en premier) et l'ouverture de la fiche pour réserver.
import { useCallback, useEffect, useState } from 'react'
import { chargerMenusEntre, decrireFormule, platsDuJour } from '../lib/menus'
import { chargerMesReservations, reservationFermee } from '../lib/reservations'
import { problemeDuPlat } from '../lib/allergenes'
import {
  dateDuJour,
  formaterDate,
  formaterJourCourt,
  formaterNumeroJour,
  joursOuvresDeLaSemaine,
} from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import ChoixPlat from '../composants/ChoixPlat'
import Icone from '../composants/Icone'
import '../menus.css'
import NavigationSemaine from '../composants/NavigationSemaine'
import Vide from '../composants/Vide'

// Pastille sous le jour : vert si au moins un plat lui va, rouge si aucun
function classeDuJour(plats, estActif, profil) {
  const classes = ['jour']
  if (plats.length > 0) classes.push(plats.some((menu) => !problemeDuPlat(menu, profil)) ? 'jour-ok' : 'jour-risque')
  if (estActif) classes.push('actif')
  return classes.join(' ')
}

// Jour affiché au départ : aujourd'hui en semaine, sinon le lundi qui vient
function jourDeDepart(aujourdhui) {
  const jours = joursOuvresDeLaSemaine(aujourdhui)
  return jours.includes(aujourdhui) ? aujourdhui : jours[0]
}

// Le plat réservé d'abord, puis ceux qui vont au profil, puis les autres
function trierPourLeProfil(plats, profil, idReserve) {
  const rang = (menu) => (menu.id === idReserve ? 0 : problemeDuPlat(menu, profil) ? 2 : 1)
  return [...plats].sort((a, b) => rang(a) - rang(b))
}

function etatDuPlat(menu, idReserve, fermee) {
  if (menu.id === idReserve) return 'reserve'
  if (idReserve) return 'autre'
  return fermee ? 'ferme' : 'libre'
}

export default function MenuSemaine({ profil, onOuvrirPlat, onVoirReservations }) {
  const aujourdhui = dateDuJour()
  const [jourChoisi, setJourChoisi] = useState(() => jourDeDepart(aujourdhui))
  const [menus, setMenus] = useState([])
  const [reservations, setReservations] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
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

  const plats = platsDuJour(menus, jourChoisi)
  const idReserve = reservations.find((resa) => plats.some((menu) => menu.id === resa.menu_id))?.menu_id ?? null
  const fermee = reservationFermee(jourChoisi)
  const formule = decrireFormule(plats[0])

  function changerSemaine(nouveauLundi) {
    setChargement(true)
    setJourChoisi(nouveauLundi)
  }

  function ouvrir(menu) {
    if (menu.id === idReserve) onVoirReservations()
    else onOuvrirPlat(menu)
  }

  function phraseDuJour() {
    if (idReserve) return 'Ton repas est réservé. Annule-le dans Mes repas pour changer de plat.'
    if (fermee) return 'Réservations fermées pour ce jour (la veille à 18 h).'
    return `${plats.length} plats au choix. Réserve la veille à 18 h au plus tard.`
  }

  return (
    <section className="pile">
      <h1>À chaque jour, son bonheur.</h1>
      <NavigationSemaine lundi={lundi} onChanger={changerSemaine} classeTitre="texte-safran" />

      <div className="jours" role="group" aria-label="Jours de la semaine">
        {joursSemaine.map((jour) => (
          <button
            key={jour}
            type="button"
            className={classeDuJour(platsDuJour(menus, jour), jour === jourChoisi, profil)}
            aria-pressed={jour === jourChoisi}
            aria-label={formaterDate(jour)}
            onClick={() => setJourChoisi(jour)}
          >
            <span className="jour-nom">{formaterJourCourt(jour)}</span>
            <span className="jour-numero">{formaterNumeroJour(jour)}</span>
          </button>
        ))}
      </div>

      {chargement && (
        <div className="chargement" aria-label="Chargement du menu…">
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger le menu</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && plats.length === 0 && (
        <Vide
          icone="calendrier"
          titre="Pas encore de menu ce jour-là"
          texte="La cantine prépare la suite. Regarde un autre jour."
          libelleBouton={jourChoisi === lundi ? undefined : 'Voir lundi'}
          onAction={() => setJourChoisi(lundi)}
        />
      )}

      {!chargement && !erreur && plats.length > 0 && (
        <>
          <div className="formule-jour">
            <span className="surtitre">{formaterDate(jourChoisi)}</span>
            {formule && <p className="formule-jour-texte">Entrée, dessert et boisson : {formule}</p>}
            <p className="aide">{phraseDuJour()}</p>
          </div>

          <div className="liste-choix cascade">
            {trierPourLeProfil(plats, profil, idReserve).map((menu) => (
              <ChoixPlat key={menu.id} menu={menu} profil={profil} etat={etatDuPlat(menu, idReserve, fermee)} onOuvrir={ouvrir} />
            ))}
          </div>

          {idReserve && (
            <button type="button" className="btn" onClick={onVoirReservations}>
              Voir mon ticket
            </button>
          )}
        </>
      )}
    </section>
  )
}
