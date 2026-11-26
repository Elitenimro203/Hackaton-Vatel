// Onglet Mes enfants du parent : lier un enfant par e-mail, une carte par enfant (sa carte cantine virtuelle, recharge, alertes allergie, profil alimentaire), et le délier.
import { useCallback, useEffect, useState } from 'react'
import { chargerEnfants, delierEnfant, lierEnfant, prenomDe } from '../lib/enfants'
import { chargerAlertes, marquerAlerteLue } from '../lib/alertes'
import { formaterDate, formaterDateHeure, formaterMontant } from '../lib/formatage'
import { decrireAllergenes } from '../lib/allergenes'
import { SEUIL_SOLDE_BAS, soldeEstBas } from '../lib/recharges'
import { useTempsReel } from '../lib/useTempsReel'
import CarteCantine from '../composants/CarteCantine'
import ProfilAlimentaire from '../composants/ProfilAlimentaire'
import Vide from '../composants/Vide'
import Icone from '../composants/Icone'
import '../allergies.css'
import '../recharge.css'
import '../parent.css'

function FormulaireLien({ afficherToast, onLie, onFermer }) {
  const [email, setEmail] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  async function envoyer(evenement) {
    evenement.preventDefault()
    setEnvoiEnCours(true)
    const erreur = await lierEnfant(email)
    setEnvoiEnCours(false)

    if (erreur) {
      afficherToast(erreur, 'erreur')
      return
    }
    afficherToast('Votre enfant est lié à votre compte.')
    setEmail('')
    onLie()
  }

  return (
    <form className="carte pile" onSubmit={envoyer}>
      <h2 className="carte-titre">Lier un enfant</h2>
      <div className="champ">
        <label htmlFor="email-enfant">E-mail du compte élève de votre enfant</label>
        <input
          id="email-enfant"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="awa@cantijuste.ci"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={envoiEnCours}
          required
        />
        <span className="champ-message">L’e-mail avec lequel votre enfant se connecte à CantiJuste.</span>
      </div>
      <button type="submit" className="btn" disabled={envoiEnCours || !email.trim()}>
        {envoiEnCours ? 'Liaison…' : 'Lier mon enfant'}
      </button>
      {onFermer && (
        <button type="button" className="btn btn-discret btn-petit" onClick={onFermer} disabled={envoiEnCours}>
          Fermer
        </button>
      )}
    </form>
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

      <ProfilAlimentaire eleve={enfant} afficherToast={afficherToast} onEnregistre={onModifie} pourParent />

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
        <>
          <Vide
            icone="enfants"
            titre="Aucun enfant lié pour l’instant"
            texte="Saisissez l’e-mail du compte élève de votre enfant pour suivre son solde, ses repas et ses allergies."
          />
          <FormulaireLien afficherToast={afficherToast} onLie={apresLien} />
        </>
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

      {!chargement && !erreur && enfants.length > 0 && (formulaireOuvert ? (
        <FormulaireLien afficherToast={afficherToast} onLie={apresLien} onFermer={() => setFormulaireOuvert(false)} />
      ) : (
        <button type="button" className="btn btn-discret" onClick={() => setFormulaireOuvert(true)}>
          <span className="avec-icone">
            <Icone nom="plus" />
            Lier un autre enfant
          </span>
        </button>
      ))}

      {aDelier && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre" role="alertdialog" aria-modal="true" aria-labelledby="titre-delier">
            <h2 id="titre-delier">Délier {prenomDe(aDelier)}&nbsp;?</h2>
            <p className="aide">
              Vous ne verrez plus son solde, ses repas ni ses alertes. Son compte et son solde restent intacts : vous pourrez le
              lier à nouveau avec son e-mail.
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
