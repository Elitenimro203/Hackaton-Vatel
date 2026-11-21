// Onglet Menus de l'admin : la semaine du lundi au vendredi, et le panneau pour ajouter, modifier ou supprimer un menu.
import { useCallback, useEffect, useState } from 'react'
import { chargerMenusEntre, supprimerMenu, PRIX_ELEVE_PAR_DEFAUT, PRIX_EMPLOYE_PAR_DEFAUT } from '../lib/menus'
import {
  dateDuJour,
  formaterDate,
  formaterDateAvecAnnee,
  formaterJourCourt,
  formaterMontant,
  formaterNumeroJour,
  joursOuvresDeLaSemaine,
} from '../lib/formatage'
import { useTempsReel } from '../useTempsReel'
import BadgesAllergenes from '../composants/BadgesAllergenes'
import FormulaireMenu from '../composants/FormulaireMenu'
import '../menus.css'
import NavigationSemaine from '../composants/NavigationSemaine'
import PhotoPlat from '../composants/PhotoPlat'

function texteMenusPublies(nombre) {
  if (nombre === 0) return 'Aucun menu publié'
  return nombre === 1 ? '1 menu publié' : `${nombre} menus publiés`
}

function classeCarteJour(estActif, aUnMenu) {
  return ['carte-jour', estActif && 'actif', !aUnMenu && 'carte-jour-vide'].filter(Boolean).join(' ')
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
  const joursSemaine = joursOuvresDeLaSemaine(lundi)
  const vendredi = joursSemaine[4]

  const charger = useCallback(async () => {
    const resultat = await chargerMenusEntre(lundi, vendredi)
    setMenus(resultat.menus)
    setErreur(resultat.erreur)
    setChargement(false)
  }, [lundi, vendredi])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('menus', charger)

  const menuChoisi = menus.find((menu) => menu.jour === jourChoisi) || null

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
      <div className="admin-entete">
        <span className="surtitre">Cantine Vatel · Vallon</span>
        <span className="mention">{formaterDateAvecAnnee(aujourdhui)}</span>
      </div>
      <div>
        <h1 className="admin-titre">Les menus prennent vie.</h1>
        <p className="aide">Une semaine équilibrée, pensée pour chaque appétit.</p>
      </div>

      <div className="menus-admin">
        <div className="pile">
          <div className="barre-semaine">
            <NavigationSemaine lundi={lundi} onChanger={changerSemaine} />
            <span className={menus.length > 0 ? 'badge badge-succes' : 'badge badge-neutre'}>
              {chargement ? 'Chargement…' : texteMenusPublies(menus.length)}
            </span>
          </div>

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
                  <li key={jour} className={classeCarteJour(jour === jourChoisi, Boolean(menu))}>
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
                        <span className="prix texte-safran">{formaterMontant(menu.prix, 'FCFA')}</span>
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
            afficherToast={afficherToast}
          />
        )}
      </div>

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
              {suppressionEnCours ? 'Suppression…' : '🗑️ Oui, supprimer'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
