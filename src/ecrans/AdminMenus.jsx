// Onglet Menus de l'admin : la semaine du lundi au vendredi, le panneau d'édition, et retirer, remettre, dupliquer un menu ou copier la semaine.
import { useCallback, useEffect, useState } from 'react'
import {
  chargerMenusEntre,
  dupliquerMenu,
  dupliquerSemaine,
  remettreAuMenu,
  retirerMenu,
  supprimerMenu,
  PRIX_ELEVE_PAR_DEFAUT,
  PRIX_EMPLOYE_PAR_DEFAUT,
} from '../lib/menus'
import {
  ajouterJours,
  dateDuJour,
  formaterDate,
  formaterJourCourt,
  formaterMontant,
  formaterNumeroJour,
  formaterPlageSemaine,
  joursOuvresDeLaSemaine,
} from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import BadgesAllergenes from '../composants/BadgesAllergenes'
import FormulaireMenu from '../composants/FormulaireMenu'
import Icone from '../composants/Icone'
import '../menus.css'
import NavigationSemaine from '../composants/NavigationSemaine'
import PhotoPlat from '../composants/PhotoPlat'

function texteMenusPublies(nombre) {
  if (nombre === 0) return 'Aucun menu publié'
  return nombre === 1 ? '1 menu publié' : `${nombre} menus publiés`
}

function classeCarteJour(estActif, menu) {
  return ['carte-jour', estActif && 'actif', !menu && 'carte-jour-vide', menu?.retire && 'carte-jour-retiree']
    .filter(Boolean)
    .join(' ')
}

// « 3 menus copiés », avec les jours sautés s'il y en a
function texteCopieSemaine(copies, sautes) {
  if (copies === 0) return 'Rien à copier : la semaine suivante a déjà ses menus.'
  const debut = copies === 1 ? '1 menu copié' : `${copies} menus copiés`
  if (sautes === 0) return `${debut}.`
  return `${debut}, ${sautes} jour${sautes > 1 ? 's' : ''} déjà pris ou passé${sautes > 1 ? 's' : ''}.`
}

// Date proposée pour dupliquer : une semaine plus tard, jamais dans le passé
function dateProposee(menu, aujourdhui) {
  const uneSemainePlusTard = ajouterJours(menu.jour, 7)
  return uneSemainePlusTard >= aujourdhui ? uneSemainePlusTard : ajouterJours(aujourdhui, 1)
}

export default function AdminMenus({ afficherToast }) {
  const aujourdhui = dateDuJour()
  const [lundi, setLundi] = useState(() => joursOuvresDeLaSemaine(aujourdhui)[0])
  const [jourChoisi, setJourChoisi] = useState(lundi)
  const [menus, setMenus] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [menuASupprimer, setMenuASupprimer] = useState(null)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)
  const [menuARetirer, setMenuARetirer] = useState(null)
  const [menuADupliquer, setMenuADupliquer] = useState(null)
  const [jourDuplication, setJourDuplication] = useState('')
  const [copieSemaineOuverte, setCopieSemaineOuverte] = useState(false)
  const [actionEnCours, setActionEnCours] = useState(false)
  const joursSemaine = joursOuvresDeLaSemaine(lundi)
  const vendredi = joursSemaine[4]

  const charger = useCallback(async () => {
    const resultat = await chargerMenusEntre(lundi, vendredi, { avecRetires: true })
    setMenus(resultat.menus)
    setErreur(resultat.erreur)
    setChargement(false)
  }, [lundi, vendredi])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('menus', charger)

  const menuChoisi = menus.find((menu) => menu.jour === jourChoisi) || null
  const menusEnLigne = menus.filter((menu) => !menu.retire)
  const lundiSuivant = ajouterJours(lundi, 7)

  function changerSemaine(nouveauLundi) {
    setChargement(true)
    setLundi(nouveauLundi)
    setJourChoisi(nouveauLundi)
  }

  function choisirJour(jour) {
    setJourChoisi(jour)
    document.getElementById('panneau-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function apresEnregistrement(jourEnregistre) {
    if (jourEnregistre >= lundi && jourEnregistre <= vendredi) setJourChoisi(jourEnregistre)
    charger()
  }

  function ouvrirDuplication(menu) {
    setJourDuplication(dateProposee(menu, aujourdhui))
    setMenuADupliquer(menu)
  }

  async function confirmerRetrait() {
    setActionEnCours(true)
    const { erreur: erreurRetrait, rembourses } = await retirerMenu(menuARetirer.id)
    setActionEnCours(false)
    setMenuARetirer(null)

    if (erreurRetrait) {
      afficherToast(erreurRetrait, 'erreur')
      return
    }
    if (rembourses === 0) afficherToast('Menu retiré. Les élèves ne le voient plus.')
    else afficherToast(`Menu retiré. ${rembourses} réservation${rembourses > 1 ? 's' : ''} remboursée${rembourses > 1 ? 's' : ''}.`)
    charger()
  }

  async function remettre(menu) {
    setActionEnCours(true)
    const erreurRemise = await remettreAuMenu(menu.id)
    setActionEnCours(false)

    if (erreurRemise) {
      afficherToast(erreurRemise, 'erreur')
      return
    }
    afficherToast('Menu remis en ligne pour les élèves.')
    charger()
  }

  async function confirmerDuplication(evenement) {
    evenement.preventDefault()
    setActionEnCours(true)
    const erreurCopie = await dupliquerMenu(menuADupliquer.id, jourDuplication)
    setActionEnCours(false)

    if (erreurCopie) {
      afficherToast(erreurCopie, 'erreur')
      return
    }
    setMenuADupliquer(null)
    afficherToast(`Menu copié au ${formaterDate(jourDuplication)}.`)
    const lundiCible = joursOuvresDeLaSemaine(jourDuplication)[0]
    if (lundiCible === lundi) {
      setJourChoisi(jourDuplication)
      charger()
    } else {
      changerSemaine(lundiCible)
      setJourChoisi(jourDuplication)
    }
  }

  async function confirmerCopieSemaine() {
    setActionEnCours(true)
    const { erreur: erreurCopie, copies, sautes } = await dupliquerSemaine(lundi, lundiSuivant)
    setActionEnCours(false)
    setCopieSemaineOuverte(false)

    if (erreurCopie) {
      afficherToast(erreurCopie, 'erreur')
      return
    }
    afficherToast(texteCopieSemaine(copies, sautes), copies === 0 ? 'erreur' : 'succes')
    if (copies > 0) changerSemaine(lundiSuivant)
  }

  async function confirmerSuppression() {
    setSuppressionEnCours(true)
    const erreurSuppression = await supprimerMenu(menuASupprimer.id)
    setSuppressionEnCours(false)
    setMenuASupprimer(null)

    if (erreurSuppression) {
      afficherToast(erreurSuppression, 'erreur')
      return
    }
    afficherToast('Menu supprimé.')
    charger()
  }

  return (
    <section className="pile">
      <div>
        <h1 className="admin-titre">Les menus prennent vie.</h1>
        <p className="aide">Une semaine équilibrée, pensée pour chaque appétit.</p>
      </div>

      <div className="menus-admin">
        <div className="pile">
          <div className="barre-semaine">
            <NavigationSemaine lundi={lundi} onChanger={changerSemaine} />
            <span className={menusEnLigne.length > 0 ? 'badge badge-succes' : 'badge badge-neutre'}>
              {chargement ? 'Chargement…' : texteMenusPublies(menusEnLigne.length)}
            </span>
          </div>

          {!chargement && menusEnLigne.length > 0 && (
            <button type="button" className="btn btn-secondaire btn-petit btn-copier-semaine" onClick={() => setCopieSemaineOuverte(true)}>
              <span className="avec-icone"><Icone nom="copier" />Copier vers la semaine suivante</span>
            </button>
          )}

          {erreur && (
            <div className="alerte alerte-erreur" role="alert">
              <strong>Impossible de charger les menus</strong>
              <p>{erreur}</p>
            </div>
          )}

          {chargement ? (
            <div className="semaine-grille" aria-label="Chargement des menus…">
              {joursSemaine.map((jour) => (
                <div key={jour} className="squelette squelette-photo" />
              ))}
            </div>
          ) : (
            <ul className="semaine-grille liste cascade">
              {joursSemaine.map((jour) => {
                const menu = menus.find((unMenu) => unMenu.jour === jour)
                const surtitre = `${formaterJourCourt(jour)} ${formaterNumeroJour(jour)}`
                return (
                  <li key={jour} className={classeCarteJour(jour === jourChoisi, menu)}>
                    <span className="surtitre">{surtitre}</span>
                    <PhotoPlat adresse={menu?.photo_url} nomPlat={menu?.plat} />
                    {menu ? (
                      <>
                        <h2 className="nom-plat">{menu.plat}</h2>
                        <p className="mention">
                          {menu.entree || 'Sans entrée'}
                          <br />
                          {menu.dessert || 'Sans dessert'}
                        </p>
                        {menu.retire ? (
                          <span className="badge badge-neutre"><Icone nom="retirer" />Retiré du menu</span>
                        ) : (
                          <span className="prix texte-safran">{formaterMontant(menu.prix, 'FCFA')}</span>
                        )}
                        <BadgesAllergenes allergenes={menu.allergenes} />
                        <button type="button" className="btn btn-secondaire btn-petit" onClick={() => choisirJour(jour)}>
                          Modifier
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mention">Pas de menu</p>
                        <button type="button" className="btn btn-secondaire btn-petit" onClick={() => choisirJour(jour)}>
                          + Ajouter
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="carte pile">
            <h2 className="panneau-titre">Le bon nombre, au bon moment.</h2>
            <p className="aide">
              Les réservations ferment la veille à 18 h.
              <br />
              Prix conseillés : élève {formaterMontant(PRIX_ELEVE_PAR_DEFAUT, 'FCFA')} · employé{' '}
              {formaterMontant(PRIX_EMPLOYE_PAR_DEFAUT, 'FCFA')}.
              <br />
              Les allergies sont comparées au profil de chaque convive.
            </p>
          </div>
        </div>

        {!chargement && (
          <FormulaireMenu
            key={`${jourChoisi}-${menuChoisi?.id ?? 'nouveau'}`}
            menu={menuChoisi}
            jour={jourChoisi}
            onEnregistre={apresEnregistrement}
            onSupprimer={setMenuASupprimer}
            onRetirer={setMenuARetirer}
            onRemettre={remettre}
            onDupliquer={ouvrirDuplication}
            afficherToast={afficherToast}
          />
        )}
      </div>

      {menuARetirer && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-retrait-menu">
            <h2 id="titre-retrait-menu">Retirer ce menu ?</h2>
            <p className="aide">
              {menuARetirer.plat}, {formaterDate(menuARetirer.jour)}. Les élèves ne le verront plus. Les réservations pas encore
              servies sont annulées et remboursées ; l’historique est gardé.
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setMenuARetirer(null)} disabled={actionEnCours}>
              Garder le menu
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmerRetrait} disabled={actionEnCours}>
              <span className="avec-icone">
                <Icone nom="retirer" />
                {actionEnCours ? 'Retrait…' : 'Oui, retirer'}
              </span>
            </button>
          </div>
        </div>
      )}

      {menuADupliquer && (
        <div className="voile">
          <form
            className="fenetre-bas fenetre-centre"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-duplication-menu"
            onSubmit={confirmerDuplication}
          >
            <h2 id="titre-duplication-menu">Dupliquer ce menu</h2>
            <p className="aide">
              {menuADupliquer.plat} : plat, prix, allergènes, remplacement et recette sont copiés sur le jour choisi.
            </p>
            <div className="champ">
              <label htmlFor="jour-duplication">Nouveau jour</label>
              <input
                id="jour-duplication"
                type="date"
                min={aujourdhui}
                value={jourDuplication}
                onChange={(e) => setJourDuplication(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={actionEnCours || !jourDuplication}>
              {actionEnCours ? 'Copie…' : 'Dupliquer'}
            </button>
            <button type="button" className="btn btn-discret" onClick={() => setMenuADupliquer(null)} disabled={actionEnCours}>
              Annuler
            </button>
          </form>
        </div>
      )}

      {copieSemaineOuverte && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-copie-semaine">
            <h2 id="titre-copie-semaine">Copier la semaine ?</h2>
            <p className="aide">
              {texteMenusPublies(menusEnLigne.length)} cette semaine, copiés sur la semaine du {formaterPlageSemaine(lundiSuivant)}.
              Les jours qui ont déjà un menu ne sont pas touchés.
            </p>
            <button type="button" className="btn" onClick={confirmerCopieSemaine} disabled={actionEnCours}>
              {actionEnCours ? 'Copie…' : 'Copier la semaine'}
            </button>
            <button type="button" className="btn btn-discret" onClick={() => setCopieSemaineOuverte(false)} disabled={actionEnCours}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {menuASupprimer && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-suppression-menu">
            <h2 id="titre-suppression-menu">Supprimer ce menu ?</h2>
            <p className="aide">
              {menuASupprimer.plat}, {formaterDate(menuASupprimer.jour)}. Les élèves ne le verront plus.
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setMenuASupprimer(null)} disabled={suppressionEnCours}>
              Garder le menu
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmerSuppression} disabled={suppressionEnCours}>
              <span className="avec-icone">
                <Icone nom="poubelle" />
                {suppressionEnCours ? 'Suppression…' : 'Oui, supprimer'}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
