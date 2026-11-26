// Onglet Mes enfants du parent : ajouter un enfant avec le code qu'il a créé dans son Profil, une carte par enfant (sa carte cantine virtuelle, recharge, alertes allergie, profil alimentaire), et le délier.
import { useCallback, useEffect, useState } from 'react'
import { LONGUEUR_CODE_PARENT, chargerEnfants, delierEnfant, formaterCodeParent, lierEnfantAvecCode, nettoyerCodeParent, prenomDe } from '../lib/enfants'
import { chargerAlertes, marquerAlerteLue } from '../lib/alertes'
import { formaterDate, formaterDateHeure, formaterMontant } from '../lib/formatage'
import { decrireAllergenes } from '../lib/allergenes'
import { SEUIL_SOLDE_BAS, soldeEstBas } from '../lib/recharges'
import { useTempsReel } from '../lib/useTempsReel'
import CarteCantine from '../composants/CarteCantine'
import CarteProfilAlimentaire from '../composants/CarteProfilAlimentaire'
import Icone from '../composants/Icone'
import '../allergies.css'
import '../recharge.css'
import '../parent.css'

// Ajout d'un enfant : le code à 6 caractères créé par l'enfant dans son Profil (valable 24 h, un seul usage)
function FormulaireCodeEnfant({ afficherToast, onLie }) {
  const [code, setCode] = useState('')
  const [erreurCode, setErreurCode] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const complet = code.length === LONGUEUR_CODE_PARENT

  async function envoyer(evenement) {
    evenement.preventDefault()
    if (!complet) return
    setEnvoiEnCours(true)
    const erreur = await lierEnfantAvecCode(code)
    setEnvoiEnCours(false)

    if (erreur) {
      setErreurCode(erreur)
      return
    }
    afficherToast('C’est fait : vous suivez maintenant votre enfant.')
    setCode('')
    onLie()
  }

  return (
    <form className="pile formulaire-code" onSubmit={envoyer} noValidate>
      <ol className="etapes-code">
        <li>
          <span className="etape-numero">1</span>
          <span>Sur le téléphone de votre enfant, ouvrez <strong>Profil</strong>.</span>
        </li>
        <li>
          <span className="etape-numero">2</span>
          <span>Touchez <strong>Créer mon code</strong> dans « Ta famille sur CantiJuste ».</span>
        </li>
        <li>
          <span className="etape-numero">3</span>
          <span>Saisissez ici les 6 caractères affichés.</span>
        </li>
      </ol>

      <div className={erreurCode ? 'champ champ-erreur' : 'champ'}>
        <label htmlFor="code-enfant">Code de votre enfant</label>
        <input
          id="code-enfant"
          className="champ-code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck="false"
          placeholder="ABC · 234"
          value={formaterCodeParent(code)}
          onChange={(e) => {
            setCode(nettoyerCodeParent(e.target.value))
            setErreurCode(null)
          }}
          disabled={envoiEnCours}
          aria-describedby="aide-code-enfant"
        />
        <span className="champ-message" id="aide-code-enfant">
          {erreurCode || 'Valable 24 h. Sans ce code, personne ne peut suivre votre enfant.'}
        </span>
      </div>

      <button type="submit" className="btn" disabled={!complet || envoiEnCours}>
        {envoiEnCours ? 'Vérification…' : 'Ajouter mon enfant'}
      </button>
    </form>
  )
}

function FenetreAjoutEnfant({ afficherToast, onLie, onFermer }) {
  useEffect(() => {
    function surTouche(evenement) {
      if (evenement.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div className="voile" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="fenetre-bas pile" role="dialog" aria-modal="true" aria-labelledby="titre-ajout-enfant">
        <div className="espace-entre">
          <span className="surtitre">Espace parent</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" />
          </button>
        </div>
        <h2 id="titre-ajout-enfant">Ajouter un enfant</h2>
        <FormulaireCodeEnfant afficherToast={afficherToast} onLie={onLie} />
      </div>
    </div>
  )
}

function CarteAlerte({ alerte, afficherToast, onLue }) {
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function marquerLue() {
    setEnvoiEnCours(true)
    const erreur = await marquerAlerteLue(alerte.id)
    setEnvoiEnCours(false)
    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast('Alerte marquée comme lue.')
    onLue()
  }

  return (
    <div className="alerte alerte-erreur" role="alert">
      <Icone nom="alerte" />
      <div className="pile-serree">
        <strong>
          {decrireAllergenes(alerte.allergenes)} · {alerte.menus ? formaterDate(alerte.menus.jour) : 'repas réservé'}
        </strong>
        <p>{alerte.message}</p>
        <p className="mention">Reçue le {formaterDateHeure(alerte.cree_le)}</p>
        <button type="button" className="btn btn-discret btn-petit" onClick={marquerLue} disabled={envoiEnCours}>
          {envoiEnCours ? 'Envoi…' : 'Marquer comme lue'}
        </button>
      </div>
    </div>
  )
}

function CarteEnfant({ enfant, alertes, afficherToast, onRecharger, onDelier, onModifie }) {
  const prenom = prenomDe(enfant)
  const soldeBas = soldeEstBas(enfant.solde)
  const alertesNonLues = alertes.filter((alerte) => alerte.eleve_id === enfant.id && !alerte.lue)

  return (
    <article className={soldeBas ? 'carte pile carte-enfant carte-enfant-alerte' : 'carte pile carte-enfant'}>
      <div className="espace-entre">
        <h2 className="carte-titre carte-titre-enfant">{enfant.nom || prenom}</h2>
        <span className="badge badge-neutre">{enfant.type_usager === 'employe' ? 'Employé' : 'Élève'}</span>
      </div>

      <CarteCantine profil={enfant} />
      {soldeBas && (
        <p className="mention mention-safran">Moins de {formaterMontant(SEUIL_SOLDE_BAS)} : rechargez avant demain.</p>
      )}

      <button type="button" className="btn btn-secondaire" onClick={() => onRecharger(enfant.id)}>
        <span className="avec-icone">
            <Icone nom="carte-bancaire" />
            Recharger {prenom}
          </span>
      </button>

      {alertesNonLues.length === 0 ? (
        <span className="badge badge-succes badge-seul"><Icone nom="bouclier" />Aucune alerte allergie</span>
      ) : (
        alertesNonLues.map((alerte) => (
          <CarteAlerte key={alerte.id} alerte={alerte} afficherToast={afficherToast} onLue={onModifie} />
        ))
      )}

      <CarteProfilAlimentaire eleve={enfant} afficherToast={afficherToast} onEnregistre={onModifie} pourParent />

      <button type="button" className="btn btn-danger btn-petit btn-delier" onClick={() => onDelier(enfant)}>
        Délier ce compte
      </button>
    </article>
  )
}

export default function MesEnfants({ afficherToast, onRecharger, onLiensModifies }) {
  const [enfants, setEnfants] = useState([])
  const [alertes, setAlertes] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [aDelier, setADelier] = useState(null)
  const [delierEnCours, setDelierEnCours] = useState(false)

  const charger = useCallback(async () => {
    const resultatEnfants = await chargerEnfants()
    const resultatAlertes = await chargerAlertes()
    setEnfants(resultatEnfants.enfants)
    setAlertes(resultatAlertes.alertes)
    setErreur(resultatEnfants.erreur || resultatAlertes.erreur)
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // Une alerte ou un changement de solde apparaît sans recharger la page
  useTempsReel('alertes', charger)
  useTempsReel('profiles', charger)

  const fermerFormulaire = useCallback(() => setFormulaireOuvert(false), [])

  function apresLien() {
    setFormulaireOuvert(false)
    charger()
    onLiensModifies()
  }

  async function confirmerDelier() {
    setDelierEnCours(true)
    const erreurDelier = await delierEnfant(aDelier.id)
    setDelierEnCours(false)
    const prenom = prenomDe(aDelier)
    setADelier(null)

    if (erreurDelier) {
      afficherToast(erreurDelier, 'erreur')
      return
    }
    afficherToast(`${prenom} n’est plus lié à votre compte.`)
    charger()
    onLiensModifies()
  }

  return (
    <section className="pile">
      <span className="surtitre">
        Espace parent{enfants.length === 1 ? ` · pour ${prenomDe(enfants[0])}` : ''}
      </span>
      <h1>Bien manger, l’esprit léger.</h1>

      {chargement && (
        <div className="chargement" aria-label="Chargement de vos enfants…">
          <div className="squelette" />
          <div className="squelette squelette-ligne" />
        </div>
      )}

      {!chargement && erreur && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="alerte" />
          <div>
            <strong>Impossible de charger vos enfants</strong>
            <p>{erreur}</p>
          </div>
        </div>
      )}

      {!chargement && !erreur && enfants.length === 0 && (
        <div className="carte pile accueil-parent">
          <span className="invitation-parent-icone" aria-hidden="true">
            <Icone nom="enfants" />
          </span>
          <h2 className="carte-titre">Suivez les repas de votre enfant</h2>
          <p className="aide">Son solde, ce qu’il mange et une alerte en cas d’allergie. Il vous suffit du code qu’il crée sur son téléphone.</p>
          <FormulaireCodeEnfant afficherToast={afficherToast} onLie={apresLien} />
        </div>
      )}

      {!chargement && enfants.map((enfant) => (
        <CarteEnfant
          key={enfant.id}
          enfant={enfant}
          alertes={alertes}
          afficherToast={afficherToast}
          onRecharger={onRecharger}
          onDelier={setADelier}
          onModifie={charger}
        />
      ))}

      {!chargement && !erreur && enfants.length > 0 && (
        <button type="button" className="tuile-ajout" onClick={() => setFormulaireOuvert(true)}>
          <span className="tuile-ajout-icone" aria-hidden="true">
            <Icone nom="plus" />
          </span>
          <span className="tuile-ajout-texte">
            <strong>Ajouter un enfant</strong>
            <span className="mention">Avec le code créé sur son téléphone</span>
          </span>
          <Icone nom="suivant" className="tuile-ajout-fleche" />
        </button>
      )}

      {formulaireOuvert && <FenetreAjoutEnfant afficherToast={afficherToast} onLie={apresLien} onFermer={fermerFormulaire} />}

      {aDelier && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-delier">
            <h2 id="titre-delier">Délier {prenomDe(aDelier)}&nbsp;?</h2>
            <p className="aide">
              Vous ne verrez plus son solde, ses repas ni ses alertes. Son compte et son solde restent intacts : vous pourrez le
              lier à nouveau avec un nouveau code créé sur son téléphone.
            </p>
            <button type="button" className="btn btn-secondaire" onClick={() => setADelier(null)} disabled={delierEnCours}>
              Garder le lien
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmerDelier} disabled={delierEnCours}>
              {delierEnCours ? 'Envoi…' : 'Oui, délier'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
