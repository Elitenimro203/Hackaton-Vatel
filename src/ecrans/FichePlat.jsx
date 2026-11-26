// Fiche d'un plat : grande photo, vérification des allergies et du régime du profil, choix du créneau de passage, solde, et réservation par reserver().
import { Fragment, useCallback, useEffect, useState } from 'react'
import { prixPourProfil } from '../lib/menus'
import { reservationFermee, reserverRepas } from '../lib/reservations'
import { allergenesARisque, alternativeCompatible, decrireAllergenes, nommerAllergenes } from '../lib/allergenes'
import { libelleRegime, raisonRegimeDuMenu, soupconAutreAllergie } from '../lib/regimes'
import { chargerAffluence } from '../lib/affluence'
import { creneauConseille, preparerCreneaux } from '../lib/fileAttente'
import { formaterCreneau, formaterDate, formaterMontant, HORAIRE_SERVICE } from '../lib/formatage'
import BadgesAllergenes from '../composants/BadgesAllergenes'
import FenetreAllergie from '../composants/FenetreAllergie'
import ChoixCreneau from '../composants/ChoixCreneau'
import Icone from '../composants/Icone'
import '../reservation.css'

const DUREE_VERIFICATION = 900

// Le texte de l'entrée et du dessert sous le nom du plat
function decrireAccompagnements(menu) {
  const morceaux = []
  if (menu.entree) morceaux.push(`En entrée, ${menu.entree.toLowerCase()}`)
  if (menu.dessert) morceaux.push(`en dessert, ${menu.dessert.toLowerCase()}`)
  if (morceaux.length === 0) return 'Préparé ce matin par la cantine.'
  const phrase = morceaux.join(' et ')
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`
}

// « Arachide · Végétarien · Autre : kiwi », ou null si rien n'est déclaré
function resumerProfil(profil) {
  const morceaux = []
  if ((profil.allergies || []).length > 0) morceaux.push(decrireAllergenes(profil.allergies))
  if (profil.regime && profil.regime !== 'aucun') morceaux.push(libelleRegime(profil.regime))
  if (profil.autre_allergie) morceaux.push(`Autre : ${profil.autre_allergie}`)
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}

// Le menu tel qu'il a été réservé : avec le nom et la photo du plat de remplacement si besoin
function menuReserve(menu, alternative) {
  if (!alternative) return menu
  return { ...menu, plat: menu.plat_alternatif, photo_url: menu.photo_alternative || menu.photo_url }
}

export default function FichePlat({ menu, profil, afficherToast, onRetour, onReserve, onModifierProfil }) {
  const [verificationEnCours, setVerificationEnCours] = useState(true)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [risquesFenetre, setRisquesFenetre] = useState(null)
  const [creneaux, setCreneaux] = useState([])
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const allergies = profil.allergies || []
  const risques = allergenesARisque(menu.allergenes, allergies)
  const regime = profil.regime || 'aucun'
  const raisonRegime = raisonRegimeDuMenu(menu, profil)
  const soupcon = soupconAutreAllergie(profil.autre_allergie, menu)
  const avecAlternative = alternativeCompatible(menu, allergies, regime)
  const proposerRemplacement = risques.length === 0 && Boolean(raisonRegime) && avecAlternative
  const resumeProfil = resumerProfil(profil)
  const prix = prixPourProfil(menu, profil)
  const soldeInsuffisant = profil.solde < prix
  const fermee = reservationFermee(menu.jour)

  // Affluence du jour par créneau ; si le module n'est pas installé, on réserve simplement sans créneau
  const chargerCreneaux = useCallback(async () => {
    const resultat = await chargerAffluence(menu.jour)
    if (resultat.erreur || resultat.creneaux.length === 0) {
      setCreneaux([])
      setCreneauChoisi(null)
      return
    }
    const prepares = preparerCreneaux(resultat.creneaux, resultat.reglages)
    setCreneaux(prepares)
    setCreneauChoisi(creneauConseille(prepares))
  }, [menu.jour])

  useEffect(() => {
    if (!fermee) chargerCreneaux()
  }, [fermee, chargerCreneaux])

  // L'anneau « Analyse de ton profil… » tourne un court instant avant le verdict
  useEffect(() => {
    const minuteur = setTimeout(() => setVerificationEnCours(false), DUREE_VERIFICATION)
    return () => clearTimeout(minuteur)
  }, [])

  async function reserver({ accepteAllergie = false, alternative = false } = {}) {
    setEnvoiEnCours(true)
    const { erreur, alerteAllergie } = await reserverRepas(menu.id, { accepteAllergie, alternative, creneau: creneauChoisi })
    setEnvoiEnCours(false)

    // La base a trouvé un allergène du profil : on ouvre la fenêtre d'alerte au lieu de réserver
    if (erreur && alerteAllergie) {
      setRisquesFenetre(alerteAllergie)
      return
    }
    if (erreur) {
      afficherToast(erreur, 'erreur')
      if (creneauChoisi) chargerCreneaux()
      return
    }

    setRisquesFenetre(null)
    if (alerteAllergie) afficherToast('C’est réservé. Ton parent a été prévenu.')
    else if (alternative) afficherToast(`C’est réservé : ${menu.plat_alternatif}.`)
    else if (creneauChoisi) afficherToast(`C’est réservé ! Passe à ${formaterCreneau(creneauChoisi)}.`)
    else afficherToast(`C’est réservé ! ${formaterMontant(prix)} débités de ton solde.`)
    onReserve(menuReserve(menu, alternative))
  }

  function demanderReservation() {
    if (risques.length > 0) setRisquesFenetre(risques)
    else reserver({ alternative: proposerRemplacement })
  }

  function texteBouton() {
    if (envoiEnCours) return 'Réservation…'
    if (fermee) return 'Réservations fermées'
    if (soldeInsuffisant) return 'Solde insuffisant'
    if (risques.length > 0 && avecAlternative) return 'Trouver mon alternative'
    if (proposerRemplacement) return 'Prendre le remplacement'
    return `Je réserve · ${formaterMontant(prix)}`
  }

  return (
    <section className="pile fiche">
      <div className="plat-vedette">
        {menu.photo_url && <img className="plat-vedette-photo" src={menu.photo_url} alt={menu.plat} />}
        <div className="plat-vedette-haut">
          <button type="button" className="btn-retour" onClick={onRetour} aria-label="Retour au menu">
            <Icone nom="retour" />
          </button>
          <span className="surtitre fiche-surtitre">{formaterDate(menu.jour)}</span>
          <span className="pastille-solde" aria-label="Ton solde">
            <Icone nom="portefeuille" />
            {formaterMontant(profil.solde)}
          </span>
        </div>
        <div className="plat-vedette-contenu">
          <span className="surtitre">Fait ce matin · servi bien chaud</span>
          <h1 className="nom-vedette mots">
            {menu.plat.split(' ').map((mot, position) => (
              <Fragment key={`${mot}-${position}`}>
                <span>{mot}</span>{' '}
              </Fragment>
            ))}
          </h1>
        </div>
      </div>

      <p className="phrase-gourmande">{decrireAccompagnements(menu)}</p>

      <div className="espace-entre">
        <span className="aide"><Icone nom="horloge" className="icone-safran" /> {HORAIRE_SERVICE}</span>
        <span className="prix prix-vedette">{formaterMontant(prix)}</span>
      </div>

      <div className="separateur" />

      <div className="espace-entre fiche-profil">
        <div>
          <h2 className="carte-titre">Ton profil alimentaire</h2>
          <p className="aide">
            {resumeProfil ? `Ton profil : ${resumeProfil}` : 'Aucune allergie ni régime déclaré.'}
          </p>
        </div>
        <button type="button" className="btn btn-secondaire btn-petit" onClick={onModifierProfil}>
          Modifier
        </button>
      </div>

      {verificationEnCours && (
        <div className="verif" role="status">
          <span className="anneau" aria-hidden="true" />
          <div>
            <p className="verif-titre">Analyse de ton profil…</p>
            <p className="verif-texte">On compare le plat à tes allergies et à ton régime.</p>
          </div>
        </div>
      )}

      {!verificationEnCours && risques.length === 0 && !raisonRegime && !soupcon && (
        <div className="verif verif-ok" role="status">
          <Icone nom="bouclier" className="verif-icone" />
          <div>
            <p className="verif-titre">Compatible avec ton profil</p>
            <p className="verif-texte">Allergies et régime vérifiés depuis ton profil.</p>
          </div>
        </div>
      )}

      {!verificationEnCours && risques.length === 0 && raisonRegime && (
        <div className="verif verif-danger" role="alert">
          <Icone nom="alerte" className="verif-icone" />
          <div>
            <p className="verif-titre">Hors de ton régime {libelleRegime(regime).toLowerCase()}</p>
            <p className="verif-texte">
              {raisonRegime}.{' '}
              {avecAlternative ? `Le plat de remplacement te va : ${menu.plat_alternatif}.` : 'Pas de remplacement ce jour-là.'}
            </p>
          </div>
        </div>
      )}

      {!verificationEnCours && risques.length === 0 && !raisonRegime && soupcon && (
        <div className="alerte alerte-attention" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Peut contenir : {profil.autre_allergie}</strong>
            <p>Demande à la cantine avant de réserver. Ton parent et la cuisine voient cette allergie.</p>
          </div>
        </div>
      )}

      {!verificationEnCours && risques.length > 0 && (
        <div className="verif verif-danger" role="alert">
          <Icone nom="alerte" className="verif-icone" />
          <div>
            <p className="verif-titre">Contient {nommerAllergenes(risques)}</p>
            <p className="verif-texte">
              {avecAlternative ? 'Un plat de remplacement t’attend.' : 'C’est noté dans ton profil. Choisis plutôt un autre jour.'}
            </p>
          </div>
        </div>
      )}

      <BadgesAllergenes allergenes={menu.allergenes} allergiesProfil={allergies} />

      {soldeInsuffisant && !fermee && (
        <div className="alerte alerte-attention" role="alert">
          <Icone nom="carte-bancaire" />
          <div>
            <strong>Il te manque {formaterMontant(prix - profil.solde)}</strong>
            <p>Demande à ton parent de recharger ton compte, puis reviens réserver.</p>
          </div>
        </div>
      )}

      {fermee && (
        <p className="mention centre">On réserve au plus tard la veille à 18 h. Ce jour-là est fermé.</p>
      )}

      {!fermee && !soldeInsuffisant && creneaux.length > 0 && (
        <ChoixCreneau creneaux={creneaux} creneauChoisi={creneauChoisi} onChoisir={setCreneauChoisi} />
      )}

      <button
        type="button"
        className="btn"
        onClick={demanderReservation}
        disabled={envoiEnCours || verificationEnCours || fermee || soldeInsuffisant}
      >
        {texteBouton()}
      </button>
      {proposerRemplacement && !fermee && !soldeInsuffisant && (
        <button type="button" className="btn btn-discret" onClick={() => reserver()} disabled={envoiEnCours || verificationEnCours}>
          Réserver le plat du jour quand même
        </button>
      )}
      {!fermee && !soldeInsuffisant && (
        <p className="mention centre">
          Il te restera {formaterMontant(profil.solde - prix)} · annulable jusqu’à la veille 18 h
        </p>
      )}

      {risquesFenetre && (
        <FenetreAllergie
          menu={menu}
          profil={profil}
          risques={risquesFenetre}
          prix={prix}
          envoiEnCours={envoiEnCours}
          onReserverAlternative={() => reserver({ alternative: true })}
          onReserverQuandMeme={() => reserver({ accepteAllergie: true })}
          onFermer={() => setRisquesFenetre(null)}
        />
      )}
    </section>
  )
}
