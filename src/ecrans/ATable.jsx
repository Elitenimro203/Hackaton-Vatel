// Onglet « À table » de l'élève : le plat vedette à réserver en grand, puis la semaine qui se savoure en carrousel.
import { useCallback, useEffect, useState } from 'react'
import { chargerMenusEntre, prixPourProfil } from '../lib/menus'
import { chargerMesReservations, reservationFermee } from '../lib/reservations'
import { allergenesARisque, decrireAllergenes } from '../lib/allergenes'
import { raisonRegimeDuMenu } from '../lib/regimes'
import { ajouterJours, dateDuJour, formaterDateCourte, formaterMontant, prenomAffiche } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import PhotoPlat from '../composants/PhotoPlat'
import Vide from '../composants/Vide'
import Icone from '../composants/Icone'

const JOURS_AFFICHES = 13

export default function ATable({ profil, onOuvrirPlat, onVoirMenu, onVoirReservations }) {
  const aujourdhui = dateDuJour()
  const [menus, setMenus] = useState([])
  const [reservations, setReservations] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const allergies = profil.allergies || []
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

  // Les plats qu'on peut encore réserver (jusqu'à la veille 18 h) ; le premier est la vedette
  const menusOuverts = menus.filter((menu) => !reservationFermee(menu.jour))
  const vedette = menusOuverts[0]
  const suite = menusOuverts.slice(1)
  const estReserve = (menu) => reservations.some((resa) => resa.menu_id === menu.id)
  // Ce qui ne va pas au profil (« Arachide », « Contient du porc »), ou null si le plat lui convient
  const problemeDe = (menu) => {
    const risques = allergenesARisque(menu.allergenes, allergies)
    return risques.length > 0 ? decrireAllergenes(risques) : raisonRegimeDuMenu(menu, profil)
  }

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

  const problemeVedette = problemeDe(vedette)
  const vedetteReservee = estReserve(vedette)

  return (
    <section className="pile a-table">
      <p className="a-table-salut">
        Eh, {prenom}. On mange quoi ?
      </p>

      <article className="plat-vedette">
        <img className="plat-vedette-photo" src={vedette.photo_url} alt={vedette.plat} />
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
          <p className="phrase-gourmande">
            {vedette.entree ? `${vedette.entree} · ` : ''}
            {vedette.dessert || 'La braise crépite. Le piment réveille.'}
          </p>
          <button type="button" className="btn" onClick={() => ouvrir(vedette)}>
            {vedetteReservee ? 'Voir mon ticket' : 'Ça me donne faim'}
            {!vedetteReservee && <span className="btn-prix">{formaterMontant(prixPourProfil(vedette, profil))}</span>}
          </button>
        </div>
      </article>

      <div className="titre-section">
        <h2>La semaine se savoure</h2>
        {suite.length > 1 && <span className="mention avec-icone">Glisse<Icone nom="fleche-droite" /></span>}
      </div>

      {suite.length === 0 ? (
        <Vide
          icone="calendrier"
          titre="La suite arrive bientôt"
          texte="Les prochains plats seront publiés par la cantine."
          libelleBouton="Voir le menu"
          onAction={onVoirMenu}
        />
      ) : (
        <div className="carrousel cascade">
          {suite.map((menu) => {
            const probleme = problemeDe(menu)
            const reserve = estReserve(menu)
            return (
              <button
                key={menu.id}
                type="button"
                className={probleme && !reserve ? 'carte-menu carte-deconseillee' : 'carte-menu'}
                onClick={() => ouvrir(menu)}
              >
                <PhotoPlat adresse={menu.photo_url} nomPlat={menu.plat}>
                  <span className="pastille pastille-verre coin-haut">{formaterDateCourte(menu.jour)}</span>
                  {reserve && <span className="pastille pastille-ok coin-droite"><Icone nom="coche" />Réservé</span>}
                  {!reserve && probleme && (
                    <span className="pastille pastille-danger coin-bas">{probleme}</span>
                  )}
                </PhotoPlat>
                <span className="carte-menu-corps">
                  <span className="nom-plat">{menu.plat}</span>
                  <span className="carte-menu-pied">
                    <span className="prix texte-safran">{formaterMontant(prixPourProfil(menu, profil))}</span>
                    {!reserve && probleme && <span className="mention-danger"><Icone nom="alerte" /> Pas pour toi</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
