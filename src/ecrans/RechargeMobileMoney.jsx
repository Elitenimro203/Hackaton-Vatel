// Faux écran de paiement Mobile Money (élève ou parent) : opérateur, numéro, montant rapide ou libre (500 à 50 000 F), attente de 2 secondes, puis recharge via la RPC.
import { useState } from 'react'
import {
  DUREE_SIMULATION,
  MONTANT_MAX_RECHARGE,
  MONTANT_MIN_RECHARGE,
  MONTANTS_RAPIDES,
  OPERATEURS,
  chiffresDuMontant,
  formaterNumero,
  numeroValide,
  rechargerMobileMoney,
  soldeEstBas,
  verifierMontantRecharge,
} from '../lib/recharges'
import { formaterMontant, formaterNombre } from '../lib/formatage'
import Icone from '../composants/Icone'
import '../reservation.css'
import '../recharge.css'

function attendre(millisecondes) {
  return new Promise((resoudre) => setTimeout(resoudre, millisecondes))
}

export default function RechargeMobileMoney({ beneficiaire, pourParent, titre, aide, selecteur, onRetour, afficherToast, onPayee }) {
  const [operateur, setOperateur] = useState(OPERATEURS[0])
  const [montantRapide, setMontantRapide] = useState(MONTANTS_RAPIDES[1])
  const [montantLibre, setMontantLibre] = useState('')
  const [numero, setNumero] = useState('')
  const [paiementEnCours, setPaiementEnCours] = useState(false)
  const prenom = (beneficiaire.nom || '').trim().split(' ')[0] || (pourParent ? 'Votre enfant' : 'Toi')
  const soldeBas = soldeEstBas(beneficiaire.solde)
  const numeroOk = numeroValide(numero)
  // Un montant tapé remplace le montant rapide choisi
  const montant = montantLibre ? Number(montantLibre) : montantRapide
  const erreurMontant = verifierMontantRecharge(montant)
  const formatMontantLibre = montantLibre ? formaterNombre(Number(montantLibre)) : ''

  function choisirMontantRapide(valeur) {
    setMontantRapide(valeur)
    setMontantLibre('')
  }

  async function payer(evenement) {
    evenement.preventDefault()
    if (erreurMontant) {
      afficherToast(erreurMontant, 'erreur')
      return
    }
    setPaiementEnCours(true)
    // Simulation : on laisse le temps de « valider sur le téléphone » avant de créditer
    await attendre(DUREE_SIMULATION)
    const resultat = await rechargerMobileMoney(beneficiaire.id, montant, operateur)
    setPaiementEnCours(false)

    if (resultat.erreur) {
      afficherToast(resultat.erreur, 'erreur')
      return
    }
    afficherToast(`${formaterMontant(montant)} ajoutés au solde de ${prenom}.`)
    onPayee({ montant, operateur, numero: formaterNumero(numero), nouveauSolde: resultat.nouveauSolde, prenom })
  }

  return (
    <section className="pile">
      {onRetour && (
        <button type="button" className="btn btn-discret btn-petit lien-retour" onClick={onRetour}>
          <span className="avec-icone">
            <Icone nom="retour" />
            Mes repas
          </span>
        </button>
      )}

      <div className="espace-entre">
        <span className="surtitre">Recharge Mobile Money</span>
        <span className="badge badge-neutre"><Icone nom="fiole" />Simulation</span>
      </div>
      <h1>{titre}</h1>
      {aide && <p className="aide">{aide}</p>}

      <div className="carte-beneficiaire">
        <span className="surtitre">
          {beneficiaire.nom || prenom} · {beneficiaire.type_usager === 'employe' ? 'Employé' : 'Élève'}
        </span>
        <p className="nom-solde">
          {prenom} · {formaterMontant(beneficiaire.solde)}
        </p>
        {soldeBas && (
          <p className="solde-bas-texte">{pourParent ? 'Solde bas : rechargez avant demain' : 'Solde bas : recharge avant demain'}</p>
        )}
      </div>

      {selecteur}

      <h2 className="slogan">Un bon repas, l’esprit léger.</h2>

      <form className="pile" onSubmit={payer}>
        <fieldset className="groupe-choix">
          <legend className="libelle-groupe">{pourParent ? 'Choisissez un moyen de paiement' : 'Choisis un moyen de paiement'}</legend>
          <div className="tuiles-3">
            {OPERATEURS.map((nomOperateur) => (
              <label key={nomOperateur} className="tuile-paiement">
                <input
                  type="radio"
                  name="operateur"
                  value={nomOperateur}
                  checked={operateur === nomOperateur}
                  onChange={() => setOperateur(nomOperateur)}
                  disabled={paiementEnCours}
                />
                {nomOperateur}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="champ">
          <label htmlFor="numero-mobile-money">Numéro {operateur}</label>
          <input
            id="numero-mobile-money"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="07 08 09 10 11"
            value={formaterNumero(numero)}
            onChange={(e) => setNumero(e.target.value)}
            disabled={paiementEnCours}
            required
          />
          <span className="champ-message">10 chiffres, sans l’indicatif +225.</span>
        </div>

        <fieldset className="groupe-choix">
          <legend className="libelle-groupe">Montant de la recharge</legend>
          <div className="tuiles-3">
            {MONTANTS_RAPIDES.map((valeur) => (
              <label key={valeur} className="tuile-montant">
                <input
                  type="radio"
                  name="montant"
                  value={valeur}
                  checked={!montantLibre && montantRapide === valeur}
                  onChange={() => choisirMontantRapide(valeur)}
                  disabled={paiementEnCours}
                />
                {formaterMontant(valeur)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className={montantLibre && erreurMontant ? 'champ champ-erreur' : 'champ'}>
          <label htmlFor="montant-libre">{pourParent ? 'Ou tapez votre montant' : 'Ou tape ton montant'}</label>
          <input
            id="montant-libre"
            type="text"
            inputMode="numeric"
            placeholder="3 500"
            value={formatMontantLibre}
            onChange={(e) => setMontantLibre(chiffresDuMontant(e.target.value))}
            disabled={paiementEnCours}
          />
          <span className="champ-message">
            {montantLibre && erreurMontant
              ? erreurMontant
              : `En F, de ${formaterMontant(MONTANT_MIN_RECHARGE)} à ${formaterMontant(MONTANT_MAX_RECHARGE)} par recharge.`}
          </span>
        </div>

        <button type="submit" className="btn btn-centre" disabled={paiementEnCours || !numeroOk || Boolean(erreurMontant)}>
          {paiementEnCours ? 'Paiement…' : erreurMontant ? 'Payer' : `Payer · ${formaterMontant(montant)}`}
        </button>
        <p className="mention centre">Simulation de paiement · Aucun débit réel</p>
      </form>

      {paiementEnCours && (
        <div className="voile">
          <div className="fenetre-bas fenetre-centre attente-paiement" role="alertdialog" aria-modal="true" aria-labelledby="titre-attente">
            <div className="anneau anneau-grand" aria-hidden="true" />
            <h2 id="titre-attente">Paiement en cours…</h2>
            <p className="aide">
              {pourParent ? 'Validez' : 'Valide'} {formaterMontant(montant)} sur le {formaterNumero(numero)} avec {operateur}.
            </p>
            <span className="badge badge-neutre"><Icone nom="fiole" />Simulation · aucun débit réel</span>
          </div>
        </div>
      )}
    </section>
  )
}
