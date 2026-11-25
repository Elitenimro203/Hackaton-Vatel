// Onglet Menus de l'admin : la semaine du lundi au vendredi, les plats au choix du jour choisi, le panneau d'édition d'un plat, et retirer, remettre, dupliquer ou copier la semaine.
import { useCallback, useEffect, useState } from 'react'
import {
  chargerMenusEntre,
  dupliquerMenu,
  dupliquerSemaine,
  platsDuJour,
  remettreAuMenu,
  retirerMenu,
  supprimerMenu,
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
import FormulaireMenu from '../composants/FormulaireMenu'
import Icone from '../composants/Icone'
import '../menus.css'
import NavigationSemaine from '../composants/NavigationSemaine'
import PhotoPlat from '../composants/PhotoPlat'

function textePlats(nombre) {
  if (nombre === 0) return 'Aucun plat'
  return nombre === 1 ? '1 plat' : `${nombre} plats`
}

function classeCarteJour(estActif, plats) {
  return ['carte-jour', estActif && 'actif', plats.length === 0 && 'carte-jour-vide'].filter(Boolean).join(' ')
}

// « 12 plats copiés », avec les plats sautés s'il y en a
function texteCopieSemaine(copies, sautes) {
  if (copies === 0) return 'Rien à copier : la semaine suivante a déjà ces plats.'
  const debut = copies === 1 ? '1 plat copié' : `${copies} plats copiés`
  if (sautes === 0) return `${debut}.`
  return `${debut}, ${sautes} déjà au menu ou sur un jour passé.`
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
  // Plat ouvert dans le panneau : son id, 'nouveau' pour en ajouter un, null pour ne rien éditer
  const [platEdite, setPlatEdite] = useState(null)
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

  const platsChoisis = platsDuJour(menus, jourChoisi)
  const menuEdite = platsChoisis.find((menu) => menu.id === platEdite) || null
  // Un jour sans plat ouvre tout de suite le formulaire d'ajout
  const formulaireOuvert = platEdite === 'nouveau' || Boolean(menuEdite) || (!chargement && platsChoisis.length === 0)
  const menusEnLigne = menus.filter((menu) => !menu.retire)
  const lundiSuivant = ajouterJours(lundi, 7)

  function changerSemaine(nouveauLundi) {
    setChargement(true)
    setLundi(nouveauLundi)
    setJourChoisi(nouveauLundi)
    setPlatEdite(null)
  }

  function choisirJour(jour) {
    setJourChoisi(jour)
    setPlatEdite(null)
    document.getElementById('panneau-jour')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function editerPlat(idPlat) {
    setPlatEdite(idPlat)
    setTimeout(() => document.getElementById('panneau-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function apresEnregistrement(jourEnregistre) {
    if (jourEnregistre >= lundi && jourEnregistre <= vendredi) setJourChoisi(jourEnregistre)
    setPlatEdite(null)
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
    if (rembourses === 0) afficherToast('Plat retiré. Les élèves ne le voient plus.')
    else afficherToast(`Plat retiré. ${rembourses} réservation${rembourses > 1 ? 's' : ''} remboursée${rembourses > 1 ? 's' : ''}.`)
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
    afficherToast('Plat remis en ligne pour les élèves.')
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
    afficherToast(`Plat copié au ${formaterDate(jourDuplication)}.`)
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
    afficherToast('Plat supprimé.')
    setPlatEdite(null)
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
              {chargement ? 'Chargement…' : `${textePlats(menusEnLigne.length)} en ligne`}
            </span>
          </div>

          {erreur && (
            <div className="alerte alerte-erreur" role="alert">
              <Icone nom="alerte" />
              <div>
                <strong>Impossible de charger les menus</strong>
                <p>{erreur}</p>
              </div>
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
                const plats = platsDuJour(menus, jour)
                const enLigne = plats.filter((menu) => !menu.retire)
                const premier = enLigne[0] || plats[0]
                return (
                  <li key={jour} className={classeCarteJour(jour === jourChoisi, plats)}>
                    <button type="button" className="carte-jour-bouton" onClick={() => choisirJour(jour)} aria-pressed={jour === jourChoisi}>
                      <span className="surtitre">{formaterJourCourt(jour)} {formaterNumeroJour(jour)}</span>
                      <PhotoPlat adresse={premier?.photo_url} nomPlat={premier?.plat} />
                      {premier ? (
                        <>
                          <span className="nom-plat">{premier.plat}</span>
                          <span className="mention">
                            {enLigne.length > 1 ? `+ ${enLigne.length - 1} autre${enLigne.length > 2 ? 's' : ''} au choix` : 'Plat unique'}
                          </span>
                        </>
                      ) : (
                        <span className="mention">Pas encore de plat</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!chargement && menusEnLigne.length > 0 && (
            <button type="button" className="btn btn-discret btn-copier-semaine" onClick={() => setCopieSemaineOuverte(true)}>
              <span className="avec-icone"><Icone nom="copier" />Copier cette semaine vers la suivante</span>
            </button>
          )}
        </div>

        {!chargement && (
          <div className="pile">
            <section id="panneau-jour" className="carte pile">
              <div className="espace-entre">
                <h2 className="panneau-titre">{formaterDate(jourChoisi)}</h2>
                <span className="badge badge-neutre">{textePlats(platsChoisis.length)}</span>
              </div>
              {platsChoisis.length > 0 ? (
                <ul className="liste plats-du-jour">
                  {platsChoisis.map((menu) => (
                    <li key={menu.id} className={menu.id === platEdite ? 'plat-du-jour actif' : 'plat-du-jour'}>
                      <span className="choix-plat-vignette">
                        {menu.photo_url ? <img src={menu.photo_url} alt="" loading="lazy" /> : <Icone nom="a-table" />}
                      </span>
                      <span className="choix-plat-texte">
                        <span className="nom-plat choix-plat-nom">{menu.plat}</span>
                        {menu.retire ? (
                          <span className="mention avec-icone"><Icone nom="retirer" />Retiré du menu</span>
                        ) : (
                          <span className="mention texte-safran">{formaterMontant(menu.prix, 'FCFA')}</span>
                        )}
                      </span>
                      <button type="button" className="btn btn-secondaire btn-petit" onClick={() => editerPlat(menu.id)}>
                        Modifier
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="aide">Aucun plat ce jour-là. Ajoutez le premier : les élèves pourront le réserver jusqu’à la veille 18 h.</p>
              )}
              {platsChoisis.length > 0 && platEdite !== 'nouveau' && (
                <button type="button" className="btn btn-secondaire" onClick={() => editerPlat('nouveau')}>
                  <span className="avec-icone"><Icone nom="plus" />Ajouter un plat au choix</span>
                </button>
              )}
            </section>

            {formulaireOuvert && (
              <FormulaireMenu
                key={`${jourChoisi}-${menuEdite?.id ?? 'nouveau'}`}
                menu={menuEdite}
                jour={jourChoisi}
                formuleDuJour={platsChoisis[0]}
                onEnregistre={apresEnregistrement}
                onFermer={platsChoisis.length > 0 ? () => setPlatEdite(null) : undefined}
                onSupprimer={setMenuASupprimer}
                onRetirer={setMenuARetirer}
                onRemettre={remettre}
                onDupliquer={ouvrirDuplication}
                afficherToast={afficherToast}
              />
            )}
          </div>
        )}
      </div>

      {menuARetirer && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-retrait-menu">
            <h2 id="titre-retrait-menu">Retirer ce plat ?</h2>
            <p className="aide">
              {menuARetirer.plat}, {formaterDate(menuARetirer.jour)}. Les élèves ne le verront plus. Les réservations pas encore
              servies sont annulées et remboursées ; l’historique est gardé.
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setMenuARetirer(null)} disabled={actionEnCours}>
              Garder le plat
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
            <h2 id="titre-duplication-menu">Dupliquer ce plat</h2>
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
              {textePlats(menusEnLigne.length)} en ligne cette semaine, copiés sur la semaine du {formaterPlageSemaine(lundiSuivant)}.
              Un plat déjà au menu le même jour n’est pas copié deux fois.
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
            <h2 id="titre-suppression-menu">Supprimer ce plat ?</h2>
            <p className="aide">
              {menuASupprimer.plat}, {formaterDate(menuASupprimer.jour)}. Les élèves ne le verront plus.
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setMenuASupprimer(null)} disabled={suppressionEnCours}>
              Garder le plat
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
