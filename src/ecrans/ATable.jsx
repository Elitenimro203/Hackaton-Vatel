// Onglet « À table » de l'élève : le prochain repas à réserver, un plat vedette en grand et les autres plats au choix du même jour.
import { useCallback, useEffect, useState } from 'react'
import { chargerMenusEntre, decrireFormule, platsDuJour, prixPourProfil } from '../lib/menus'
import { chargerMesReservations, reservationFermee } from '../lib/reservations'
import { problemeDuPlat } from '../lib/allergenes'
import { ajouterJours, dateDuJour, formaterDateCourte, formaterMontant, prenomAffiche } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import ChoixPlat from '../composants/ChoixPlat'
import Vide from '../composants/Vide'
import Icone from '../composants/Icone'

const JOURS_AFFICHES = 13

export default function ATable({ profil, onOuvrirPlat, onVoirMenu, onVoirReservations }) {
  const aujourdhui = dateDuJour()
  const [menus, setMenus] = useState([])
  const [reservations, setReservations] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const prenom = prenomAffiche(profil.nom, 'toi')

  const charger = useCallback(async () => {
    const resultatMenus = await chargerMenusEntre(aujourdhui, ajouterJours(aujourdhui, JOURS_AFFICHES))
    const resultatReservations = await chargerMesReservations(profil.id, resultatMenus.menus.map((menu) => menu.id))
    setMenus(resultatMenus.menus)
    setReservations(resultatReservations.reservations)
    setErreur(resultatMenus.erreur || resultatReservations.erreur)
    setChargement(false)
  }, [aujourdhui, profil.id])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('menus', charger)
  useTempsReel('reservations', charger, `eleve_id=eq.${profil.id}`)

  // Le premier jour encore ouvert à la réservation (jusqu'à la veille 18 h) et ses plats au choix
  const menusOuverts = menus.filter((menu) => !reservationFermee(menu.jour))
  const prochainJour = menusOuverts[0]?.jour
  const platsDuProchainJour = prochainJour ? platsDuJour(menusOuverts, prochainJour) : []
  const idReserve = reservations.find((resa) => platsDuProchainJour.some((menu) => menu.id === resa.menu_id))?.menu_id ?? null
  // La vedette : le plat réservé, sinon le premier qui va au profil (avec photo de préférence), sinon le premier du jour
  const vedette =
    platsDuProchainJour.find((menu) => menu.id === idReserve) ||
    platsDuProchainJour.find((menu) => !problemeDuPlat(menu, profil) && menu.photo_url) ||
    platsDuProchainJour.find((menu) => !problemeDuPlat(menu, profil)) ||
    platsDuProchainJour[0]
  const autresChoix = platsDuProchainJour.filter((menu) => menu !== vedette)
  const estReserve = (menu) => menu.id === idReserve

  function ouvrir(menu) {
    if (estReserve(menu)) onVoirReservations()
    else onOuvrirPlat(menu)
  }

  if (chargement) {
    return (
      <section className="pile">
        <p className="aide">Eh, {prenom}. On mange quoi ?</p>
        <div className="chargement" aria-label="Chargement du plat du jour…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      </section>
    )
  }

  if (erreur) {
    return (
      <section className="pile">
        <h1>Eh, {prenom}. On mange quoi ?</h1>
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger les plats</strong>
            <p>{erreur}</p>
          </div>
        </div>
      </section>
    )
  }

  if (!vedette) {
    return (
      <section className="pile">
        <h1>Eh, {prenom}. On mange quoi ?</h1>
        <Vide
          icone="a-table"
          titre="La cuisine prépare la suite"
          texte="Aucun plat n'est encore ouvert à la réservation. Jette un œil au menu de la semaine."
          libelleBouton="Voir la semaine"
          onAction={onVoirMenu}
        />
      </section>
    )
  }

  const problemeVedette = problemeDuPlat(vedette, profil)
  const vedetteReservee = estReserve(vedette)

  return (
    <section className="pile a-table">
      <p className="a-table-salut">
        Eh, {prenom}. On mange quoi ?
      </p>

      <article className="plat-vedette">
        {vedette.photo_url && <img className="plat-vedette-photo" src={vedette.photo_url} alt={vedette.plat} />}
        <div className="plat-vedette-contenu">
          <div className="rangee">
            <span className="pastille">{vedette.jour === aujourdhui ? 'Le feu du jour' : formaterDateCourte(vedette.jour)}</span>
            {vedetteReservee && <span className="pastille pastille-ok"><Icone nom="coche" />Réservé</span>}
            {!vedetteReservee && problemeVedette && (
              <span className="pastille pastille-danger"><Icone nom="alerte" />{problemeVedette}</span>
            )}
          </div>
          <h1 className="nom-vedette mots">
            {vedette.plat.split(' ').map((mot, position) => (
              <span key={position}>{mot}&nbsp;</span>
            ))}
          </h1>
          <p className="phrase-gourmande">{decrireFormule(vedette) || 'La braise crépite. Le piment réveille.'}</p>
          <button type="button" className="btn" onClick={() => ouvrir(vedette)}>
            {vedetteReservee ? 'Voir mon ticket' : 'Ça me donne faim'}
            {!vedetteReservee && <span className="btn-prix">{formaterMontant(prixPourProfil(vedette, profil))}</span>}
          </button>
        </div>
      </article>

      {autresChoix.length > 0 && (
        <>
          <div className="titre-section">
            <h2>Ou un autre plat au choix</h2>
          </div>
          <div className="liste-choix cascade">
            {autresChoix.map((menu) => (
              <ChoixPlat key={menu.id} menu={menu} profil={profil} etat={idReserve ? 'autre' : 'libre'} onOuvrir={ouvrir} />
            ))}
          </div>
        </>
      )}

      <button type="button" className="btn btn-discret" onClick={onVoirMenu}>
        <span className="avec-icone">Voir toute la semaine<Icone nom="fleche-droite" /></span>
      </button>
    </section>
  )
}
