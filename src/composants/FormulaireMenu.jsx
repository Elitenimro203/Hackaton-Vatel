// Panneau d'ajout ou de modification du menu d'un jour (date, plat, prix, photo, allergènes, contenu pour les régimes, remplacement, recette) et ses actions.
import { useEffect, useState } from 'react'
import { ALLERGENES } from '../lib/allergenes'
import { CONTENUS } from '../lib/regimes'
import { formaterDate } from '../lib/formatage'
import { enregistrerMenu, preparerMenu, PRIX_ELEVE_PAR_DEFAUT, PRIX_EMPLOYE_PAR_DEFAUT } from '../lib/menus'
import { chargerIngredients, chargerRecette, enregistrerRecette, preparerRecette } from '../lib/stocks'
import SectionRecette from './SectionRecette'
import Icone from './Icone'
import '../allergies.css'

function champsDepuisMenu(menu, jour) {
  return {
    jour: menu?.jour || jour,
    entree: menu?.entree || '',
    plat: menu?.plat || '',
    dessert: menu?.dessert || '',
    allergenes: menu?.allergenes || [],
    prix: String(menu?.prix ?? PRIX_ELEVE_PAR_DEFAUT),
    prixEmploye: String(menu?.prix_employe ?? PRIX_EMPLOYE_PAR_DEFAUT),
    photoUrl: menu?.photo_url || '',
    platAlternatif: menu?.plat_alternatif || '',
    photoAlternative: menu?.photo_alternative || '',
    allergenesAlternatif: menu?.allergenes_alternatif || [],
    contenu: menu?.contenu || [],
    contenuAlternatif: menu?.contenu_alternatif || [],
  }
}

// Cases « Ce plat contient » (viande, porc, viande non halal) qui servent à vérifier les régimes
function CasesContenu({ id, titre, valeurs, onBasculer }) {
  return (
    <div className="champ">
      <span className="champ-libelle" id={id}>{titre}</span>
      <div className="choix-grille choix-grille-3" role="group" aria-labelledby={id}>
        {CONTENUS.map((contenu) => (
          <label key={contenu.valeur} className="choix choix-safran">
            <input type="checkbox" checked={valeurs.includes(contenu.valeur)} onChange={() => onBasculer(contenu.valeur)} />
            <Icone nom={contenu.icone} className="choix-icone" />
            {contenu.libelle}
          </label>
        ))}
      </div>
    </div>
  )
}

// menu : le menu du jour à modifier, ou null pour en créer un à la date « jour »
export default function FormulaireMenu({ menu, jour, onEnregistre, onSupprimer, onRetirer, onRemettre, onDupliquer, afficherToast }) {
  const [champs, setChamps] = useState(() => champsDepuisMenu(menu, jour))
  const [erreur, setErreur] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [ingredients, setIngredients] = useState([])
  const [recette, setRecette] = useState([])
  const [recetteChargee, setRecetteChargee] = useState(false)
  const estModification = Boolean(menu)
  const estRetire = Boolean(menu?.retire)

  // La liste des ingrédients et la recette actuelle du menu ; sans le module Stocks, la section n'apparaît pas
  const idMenu = menu?.id
  useEffect(() => {
    async function chargerSectionRecette() {
      const resultatIngredients = await chargerIngredients()
      const resultatRecette = idMenu ? await chargerRecette(idMenu) : { lignes: [], erreur: null }
      setIngredients(resultatIngredients.ingredients)
      setRecette(resultatRecette.lignes)
      setRecetteChargee(!resultatIngredients.erreur && !resultatRecette.erreur)
    }
    chargerSectionRecette()
  }, [idMenu])

  function changerChamp(nom, valeur) {
    setChamps((anciens) => ({ ...anciens, [nom]: valeur }))
  }

  // nomListe : 'allergenes', 'allergenesAlternatif', 'contenu' ou 'contenuAlternatif'
  function basculerValeur(nomListe, valeur) {
    setChamps((anciens) => ({
      ...anciens,
      [nomListe]: anciens[nomListe].includes(valeur)
        ? anciens[nomListe].filter((autre) => autre !== valeur)
        : [...anciens[nomListe], valeur],
    }))
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    const { erreur: erreurSaisie, ligne } = preparerMenu(champs)
    if (erreurSaisie) {
      setErreur(erreurSaisie)
      return
    }

    const { erreur: erreurRecette, lignes: lignesRecette } = preparerRecette(recette)
    if (erreurRecette) {
      setErreur(erreurRecette)
      return
    }

    setErreur(null)
    setEnvoiEnCours(true)
    const { erreur: erreurBase, idMenu } = await enregistrerMenu(ligne, menu?.id)
    // La recette n'est envoyée que si elle a bien été chargée, pour ne jamais effacer une recette existante
    const erreurStock = !erreurBase && recetteChargee ? await enregistrerRecette(idMenu, lignesRecette) : null
    setEnvoiEnCours(false)

    if (erreurBase || erreurStock) {
      const message = erreurBase || `Menu enregistré, mais la recette non : ${erreurStock}`
      setErreur(message)
      afficherToast(message, 'erreur')
      return
    }
    afficherToast(estModification ? 'Menu enregistré.' : 'Menu publié pour les élèves.')
    onEnregistre(ligne.jour)
  }

  return (
    <form id="panneau-menu" className="carte pile panneau-edition" onSubmit={envoyer} noValidate>
      <div className="pile">
        <h2 className="panneau-titre">{formaterDate(champs.jour || jour)}</h2>
        <div className="rangee">
          <span className={estModification ? 'badge badge-attention' : 'badge badge-succes'}>
            <Icone nom={estModification ? 'crayon' : 'plus'} />
            {estModification ? 'Modification' : 'Nouveau menu'}
          </span>
          {estRetire && <span className="badge badge-neutre"><Icone nom="retirer" />Retiré du menu</span>}
        </div>
        {estRetire && <p className="aide">Les élèves ne voient plus ce plat. Remettez-le au menu pour le proposer à nouveau.</p>}
      </div>

      <div className="champ">
        <label htmlFor="menu-jour">Date</label>
        <input id="menu-jour" type="date" value={champs.jour} onChange={(e) => changerChamp('jour', e.target.value)} required />
      </div>

      <div className="champs-2">
        <div className="champ">
          <label htmlFor="menu-entree">Entrée</label>
          <input
            id="menu-entree"
            type="text"
            placeholder="Salade de tomates"
            value={champs.entree}
            onChange={(e) => changerChamp('entree', e.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="menu-dessert">Dessert</label>
          <input
            id="menu-dessert"
            type="text"
            placeholder="Ananas frais"
            value={champs.dessert}
            onChange={(e) => changerChamp('dessert', e.target.value)}
          />
        </div>
      </div>

      <div className="champ">
        <label htmlFor="menu-plat">Plat</label>
        <input
          id="menu-plat"
          type="text"
          placeholder="Garba maison"
          value={champs.plat}
          onChange={(e) => changerChamp('plat', e.target.value)}
          required
        />
      </div>

      <div className="champs-2">
        <div className="champ">
          <label htmlFor="menu-prix">Prix élève (FCFA)</label>
          <input
            id="menu-prix"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={champs.prix}
            onChange={(e) => changerChamp('prix', e.target.value)}
            required
          />
        </div>
        <div className="champ">
          <label htmlFor="menu-prix-employe">Prix employé (FCFA)</label>
          <input
            id="menu-prix-employe"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={champs.prixEmploye}
            onChange={(e) => changerChamp('prixEmploye', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="champ-photo">
        <div className="vignette">
          {champs.photoUrl.trim() ? <img src={champs.photoUrl.trim()} alt="Aperçu du plat" /> : <Icone nom="appareil-photo" />}
        </div>
        <div className="champ">
          <label htmlFor="menu-photo">Photo (adresse)</label>
          <input
            id="menu-photo"
            type="url"
            inputMode="url"
            placeholder="/photos/garba.jpg"
            value={champs.photoUrl}
            onChange={(e) => changerChamp('photoUrl', e.target.value)}
          />
        </div>
      </div>

      <div className="champ">
        <span className="champ-libelle" id="titre-allergenes-menu">Allergènes à déclarer</span>
        <div className="choix-grille choix-grille-5" role="group" aria-labelledby="titre-allergenes-menu">
          {ALLERGENES.map((allergene) => (
            <label key={allergene.valeur} className="choix">
              <input
                type="checkbox"
                checked={champs.allergenes.includes(allergene.valeur)}
                onChange={() => basculerValeur('allergenes', allergene.valeur)}
              />
              <Icone nom={allergene.icone} className="choix-icone" />
              {allergene.libelle}
            </label>
          ))}
        </div>
      </div>

      <CasesContenu
        id="titre-contenu-menu"
        titre="Ce plat contient (pour les régimes)"
        valeurs={champs.contenu}
        onBasculer={(valeur) => basculerValeur('contenu', valeur)}
      />

      <div className="pile panneau-alternative">
        <div>
          <h3 className="sous-titre">Plat de remplacement</h3>
          <p className="aide">Proposé aux élèves allergiques ou dont le régime ne va pas au plat du jour, au même prix.</p>
        </div>

        <div className="champ">
          <label htmlFor="menu-plat-alternatif">Plat</label>
          <input
            id="menu-plat-alternatif"
            type="text"
            placeholder="Kédjénou de poulet"
            value={champs.platAlternatif}
            onChange={(e) => changerChamp('platAlternatif', e.target.value)}
          />
        </div>

        <div className="champ-photo">
          <div className="vignette">
            {champs.photoAlternative.trim() ? (
              <img src={champs.photoAlternative.trim()} alt="Aperçu du plat de remplacement" />
            ) : (
              <Icone nom="appareil-photo" />
            )}
          </div>
          <div className="champ">
            <label htmlFor="menu-photo-alternative">Photo (adresse)</label>
            <input
              id="menu-photo-alternative"
              type="url"
              inputMode="url"
              placeholder="/photos/kedjenou-poulet.jpg"
              value={champs.photoAlternative}
              onChange={(e) => changerChamp('photoAlternative', e.target.value)}
            />
          </div>
        </div>

        <div className="champ">
          <span className="champ-libelle" id="titre-allergenes-alternatif">Allergènes du plat de remplacement</span>
          <div className="choix-grille choix-grille-5" role="group" aria-labelledby="titre-allergenes-alternatif">
            {ALLERGENES.map((allergene) => (
              <label key={allergene.valeur} className="choix">
                <input
                  type="checkbox"
                  checked={champs.allergenesAlternatif.includes(allergene.valeur)}
                  onChange={() => basculerValeur('allergenesAlternatif', allergene.valeur)}
                />
                <Icone nom={allergene.icone} className="choix-icone" />
                {allergene.libelle}
              </label>
            ))}
          </div>
        </div>

        <CasesContenu
          id="titre-contenu-alternatif"
          titre="Le plat de remplacement contient"
          valeurs={champs.contenuAlternatif}
          onBasculer={(valeur) => basculerValeur('contenuAlternatif', valeur)}
        />
      </div>

      {recetteChargee && ingredients.length > 0 && (
        <SectionRecette lignes={recette} ingredients={ingredients} onChange={setRecette} />
      )}

      {erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <strong>Menu non enregistré</strong>
          <p>{erreur}</p>
        </div>
      )}

      <div className="actions-formulaire">
        {estModification && (
          <button type="button" className="btn btn-danger btn-plein" onClick={() => onSupprimer(menu)} disabled={envoiEnCours}>
            Supprimer
          </button>
        )}
        <button type="submit" className="btn btn-plein" disabled={envoiEnCours}>
          {envoiEnCours ? 'Enregistrement…' : estModification ? 'Enregistrer' : 'Publier ce menu'}
        </button>
      </div>

      {estModification && (
        <div className="actions-menu">
          <button type="button" className="btn btn-secondaire btn-plein" onClick={() => onDupliquer(menu)} disabled={envoiEnCours}>
            <span className="avec-icone"><Icone nom="copier" />Dupliquer</span>
          </button>
          {estRetire ? (
            <button type="button" className="btn btn-secondaire btn-plein" onClick={() => onRemettre(menu)} disabled={envoiEnCours}>
              <span className="avec-icone"><Icone nom="remettre" />Remettre au menu</span>
            </button>
          ) : (
            <button type="button" className="btn btn-discret btn-plein" onClick={() => onRetirer(menu)} disabled={envoiEnCours}>
              <span className="avec-icone"><Icone nom="retirer" />Retirer du menu</span>
            </button>
          )}
        </div>
      )}
    </form>
  )
}
