// Onglet admin « Stocks » (charte 11.1) : liste de courses pour le prochain service, une carte par ingrédient avec sa jauge, livraisons, en temps réel.
import { useCallback, useEffect, useState } from 'react'
import { chargerBesoins, chargerDernieresLivraisons } from '../../lib/stocks'
import { ajouterJours, dateDuJour, formaterDate, formaterDateHeure, formaterQuantite } from '../../lib/formatage'
import { useTempsReel } from '../../useTempsReel'
import CarteIngredient from '../../composants/CarteIngredient'
import FenetreLivraison from '../../composants/FenetreLivraison'
import Vide from '../../composants/Vide'
import '../../stocks.css'

// « d'aujourd'hui », « de demain » ou « du lundi 23 novembre » : pour finir la phrase « …les réservations ___ »
function libelleDuJour(jour) {
  const aujourdhui = dateDuJour()
  if (jour === aujourdhui) return 'd’aujourd’hui'
  if (jour === ajouterJours(aujourdhui, 1)) return 'de demain'
  return `du ${formaterDate(jour)}`
}

export default function Stocks({ afficherToast }) {
  const [besoins, setBesoins] = useState([])
  const [livraisons, setLivraisons] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [ingredientLivraison, setIngredientLivraison] = useState(null)

  const charger = useCallback(async () => {
    const [resultatBesoins, resultatLivraisons] = await Promise.all([chargerBesoins(), chargerDernieresLivraisons()])
    setBesoins(resultatBesoins.besoins)
    setLivraisons(resultatLivraisons.livraisons)
    setErreur(resultatBesoins.erreur)
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // Une livraison, un repas servi ou une réservation : tout se recalcule seul
  useTempsReel('ingredients', charger)
  useTempsReel('reservations', charger)

  const jour = besoins[0]?.jour || dateDuJour()
  const repas = besoins[0]?.repas ?? 0
  const libelleJour = libelleDuJour(jour)
  const acommander = besoins.filter((ligne) => ligne.statut !== 'ok')

  function apresLivraison() {
    setIngredientLivraison(null)
    charger()
  }

  return (
    <section className="pile pilotage">
      <div className="admin-entete">
        <span className="surtitre">Cantine Vatel · Vallon</span>
      </div>
      <div>
        <h1 className="admin-titre">Rien ne manque demain.</h1>
        <p className="aide">
          Calculé à partir des {repas} réservation{repas > 1 ? 's' : ''} {libelleJour}.
        </p>
      </div>

      {chargement && (
        <div className="chargement" aria-label="Chargement des stocks…">
          <div className="squelette squelette-photo" />
          <div className="squelette squelette-ligne" />
          <div className="squelette" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            <strong>Impossible de charger les stocks</strong>
            <p>{erreur} Vérifiez que supabase/patch_stocks.sql a bien été lancé.</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && besoins.length === 0 && (
        <Vide
          emoji="📦"
          titre="Aucun ingrédient pour l’instant"
          texte="Lancez supabase/donnees_stocks.sql pour ajouter les 10 ingrédients de démonstration."
        />
      )}

      {!chargement && !erreur && besoins.length > 0 && (
        <>
          {acommander.length > 0 ? (
            <section className="carte-vedette carte-courses" aria-labelledby="titre-courses">
              <span className="surtitre texte-alerte">À commander</span>
              <h2 id="titre-courses" className="titre-courses">
                ⚠ {acommander.length} ingrédient{acommander.length > 1 ? 's' : ''} à commander
              </h2>
              <ul className="liste-courses">
                {acommander.map((ligne) => (
                  <li key={ligne.ingredient_id} className="ligne-course">
                    <span>
                      <strong>{ligne.nom}</strong>
                      <span className="aide">
                        {' '}
                        {Number(ligne.manque) > 0
                          ? `— il manque ${formaterQuantite(ligne.manque, ligne.unite)}`
                          : `— stock bas : ${formaterQuantite(ligne.quantite, ligne.unite)} restants`}
                      </span>
                    </span>
                    <button type="button" className="btn btn-petit" onClick={() => setIngredientLivraison(ligne)}>
                      Commander
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="carte-vedette carte-courses carte-courses-ok">
              <span className="surtitre texte-feuille">Tout est prêt pour demain</span>
              <h2 className="titre-courses">✅ Aucun ingrédient à commander</h2>
              <p className="aide">Les stocks couvrent toutes les réservations {libelleJour}.</p>
            </section>
          )}

          <ul className="stocks-grille">
            {besoins.map((ligne) => (
              <CarteIngredient
                key={ligne.ingredient_id}
                ingredient={ligne}
                libelleJour={libelleJour}
                onLivraison={setIngredientLivraison}
              />
            ))}
          </ul>

          <section className="carte pilotage-carte" aria-labelledby="titre-livraisons">
            <h2 id="titre-livraisons" className="titre-pilotage">Les dernières livraisons</h2>
            {livraisons.length === 0 ? (
              <p className="aide">Aucune livraison enregistrée. Touchez « + Livraison » sur un ingrédient quand il arrive.</p>
            ) : (
              <ul className="liste-livraisons">
                {livraisons.map((livraison) => (
                  <li key={livraison.id} className="ligne-livraison">
                    <span>
                      <strong>{livraison.ingredients?.nom}</strong>
                      <span className="mention"> · {formaterDateHeure(livraison.cree_le)}</span>
                    </span>
                    <strong className="texte-safran">
                      +{formaterQuantite(livraison.quantite, livraison.ingredients?.unite)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {ingredientLivraison && (
        <FenetreLivraison
          ingredient={ingredientLivraison}
          afficherToast={afficherToast}
          onEnregistre={apresLivraison}
          onFermer={() => setIngredientLivraison(null)}
        />
      )}
    </section>
  )
}
