// Bloc admin « Créditer un compte » : recherche par nom ou e-mail, montant, crédit via la RPC crediter, confirmation et mouvements.
import { useCallback, useEffect, useState } from 'react'
import { MONTANTS_ADMIN, MONTANT_MAX_ADMIN, chercherPersonnes, crediterCompte } from '../lib/recharges'
import { chargerMesMouvements } from '../lib/mouvements'
import { formaterMontant } from '../lib/formatage'
import ListeMouvements from '../composants/ListeMouvements'
import Vide from '../composants/Vide'
import Icone from '../composants/Icone'
import '../recharge.css'

const DELAI_RECHERCHE = 300
const MOTIF_PAR_DEFAUT = 'Crédit cantine'

export default function AdminSoldes({ afficherToast }) {
  const [recherche, setRecherche] = useState('')
  const [personnes, setPersonnes] = useState([])
  const [rechercheEnCours, setRechercheEnCours] = useState(false)
  const [personne, setPersonne] = useState(null)
  const [montant, setMontant] = useState('5000')
  const [motif, setMotif] = useState(MOTIF_PAR_DEFAUT)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [mouvements, setMouvements] = useState([])

  const texteRecherche = recherche.trim()
  const montantNombre = Number(montant)
  const montantValide = Number.isInteger(montantNombre) && montantNombre > 0 && montantNombre <= MONTANT_MAX_ADMIN

  // Recherche lancée 300 ms après la dernière lettre tapée
  useEffect(() => {
    if (texteRecherche.length < 2) {
      setPersonnes([])
      return undefined
    }
    setRechercheEnCours(true)
    const minuteur = setTimeout(async () => {
      const resultat = await chercherPersonnes(texteRecherche)
      setPersonnes(resultat.personnes)
      setRechercheEnCours(false)
      if (resultat.erreur) afficherToast(resultat.erreur, 'erreur')
    }, DELAI_RECHERCHE)
    return () => clearTimeout(minuteur)
  }, [texteRecherche, afficherToast])

  const chargerMouvements = useCallback(async (idPersonne) => {
    const resultat = await chargerMesMouvements(idPersonne)
    setMouvements(resultat.mouvements)
  }, [])

  function choisir(personneChoisie) {
    setPersonne(personneChoisie)
    setConfirmation(null)
    setMotif(MOTIF_PAR_DEFAUT)
    chargerMouvements(personneChoisie.id)
  }

  async function crediter(evenement) {
    evenement.preventDefault()
    setEnvoiEnCours(true)
    const resultat = await crediterCompte(personne.id, montantNombre, motif)
    setEnvoiEnCours(false)

    if (resultat.erreur) {
      afficherToast(resultat.erreur, 'erreur')
      return
    }
    const nouveauSolde = resultat.nouveauSolde ?? personne.solde + montantNombre
    setConfirmation({ montant: montantNombre, nom: personne.nom || personne.email, nouveauSolde })
    setPersonne({ ...personne, solde: nouveauSolde })
    setPersonnes((liste) => liste.map((p) => (p.id === personne.id ? { ...p, solde: nouveauSolde } : p)))
    afficherToast(`${formaterMontant(montantNombre, 'FCFA')} crédités.`)
    chargerMouvements(personne.id)
  }

  return (
    <div className="grille grille-soldes">
      <div className="carte pile">
        <h2 className="carte-titre">Créditer un compte</h2>
        <p className="aide">Retrouvez un élève ou un employé par son nom ou son e-mail.</p>
        <div className="champ">
          <label htmlFor="recherche-personne">Nom ou e-mail</label>
          <input
            id="recherche-personne"
            type="search"
            placeholder="Awa, koffi@cantijuste.ci…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            autoComplete="off"
          />
        </div>

        {texteRecherche.length < 2 && <p className="mention">Tapez au moins 2 lettres.</p>}

        {texteRecherche.length >= 2 && rechercheEnCours && (
          <div className="chargement" aria-label="Recherche…">
            <div className="squelette squelette-ligne" />
            <div className="squelette squelette-ligne" />
          </div>
        )}

        {texteRecherche.length >= 2 && !rechercheEnCours && personnes.length === 0 && (
          <Vide icone="loupe" titre="Aucune personne trouvée" texte="Vérifiez l’orthographe ou essayez l’e-mail." />
        )}

        {!rechercheEnCours && personnes.length > 0 && (
          <ul className="liste-repas liste-personnes">
            {personnes.map((candidat) => (
              <li key={candidat.id} className={personne?.id === candidat.id ? 'carte-ligne ligne-choisie' : 'carte-ligne'}>
                <div>
                  <p className="mouvement-motif">{candidat.nom || 'Sans nom'}</p>
                  <p className="mention texte-coupe">{candidat.email}</p>
                  <p className="mention">
                    {candidat.type_usager === 'employe' ? 'Employé' : 'Élève'} · {formaterMontant(candidat.solde, 'FCFA')}
                  </p>
                </div>
                <button type="button" className="btn btn-secondaire btn-petit" onClick={() => choisir(candidat)}>
                  {personne?.id === candidat.id ? 'Choisi' : 'Choisir'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pile">
        {!personne && (
          <Vide icone="portefeuille" titre="Aucune personne choisie" texte="Cherchez un nom à gauche, puis saisissez le montant à créditer." />
        )}

        {personne && (
          <form className="carte pile" onSubmit={crediter}>
            <div className="espace-entre">
              <div>
                <span className="surtitre">{personne.type_usager === 'employe' ? 'Employé' : 'Élève'}</span>
                <h2 className="carte-titre">{personne.nom || personne.email}</h2>
              </div>
              <span className="prix texte-safran">{formaterMontant(personne.solde, 'FCFA')}</span>
            </div>

            <fieldset className="groupe-choix">
              <legend className="libelle-groupe">Montant rapide</legend>
              <div className="tuiles-3">
                {MONTANTS_ADMIN.map((valeur) => (
                  <label key={valeur} className="tuile-montant">
                    <input
                      type="radio"
                      name="montant-rapide"
                      checked={montantNombre === valeur}
                      onChange={() => setMontant(String(valeur))}
                      disabled={envoiEnCours}
                    />
                    {formaterMontant(valeur, 'FCFA')}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={montant && !montantValide ? 'champ champ-erreur' : 'champ'}>
              <label htmlFor="montant-credit">Montant (FCFA)</label>
              <input
                id="montant-credit"
                type="number"
                inputMode="numeric"
                min="1"
                max={MONTANT_MAX_ADMIN}
                step="1"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                disabled={envoiEnCours}
                required
              />
              <span className="champ-message">Entre 1 et {formaterMontant(MONTANT_MAX_ADMIN, 'FCFA')} par crédit.</span>
            </div>

            <div className="champ">
              <label htmlFor="motif-credit">Motif</label>
              <input
                id="motif-credit"
                type="text"
                maxLength={80}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                disabled={envoiEnCours}
              />
            </div>

            <button type="submit" className="btn btn-centre" disabled={envoiEnCours || !montantValide}>
              {envoiEnCours ? 'Crédit…' : `Créditer · ${formaterMontant(montantValide ? montantNombre : 0, 'FCFA')}`}
            </button>

            {confirmation && (
              <div className="alerte alerte-succes" role="status">
                <Icone nom="coche-ronde" />
                <div>
                  <strong>
                    {formaterMontant(confirmation.montant, 'FCFA')} crédités à {confirmation.nom}
                  </strong>
                  <p>Nouveau solde : {formaterMontant(confirmation.nouveauSolde, 'FCFA')}</p>
                </div>
              </div>
            )}
          </form>
        )}

        {personne && (
          <>
            <h3 className="sous-titre-soldes">Derniers mouvements</h3>
            {mouvements.length === 0 ? (
              <Vide icone="recu" titre="Aucun mouvement" texte="Ce compte n’a encore ni recharge ni repas." />
            ) : (
              <ListeMouvements mouvements={mouvements} unite="FCFA" />
            )}
          </>
        )}
      </div>
    </div>
  )
}
