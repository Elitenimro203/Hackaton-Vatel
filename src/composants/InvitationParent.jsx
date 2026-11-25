// Profil de l'élève : ses parents liés, et le code d'invitation à 6 caractères (24 h, un seul usage) qu'il donne à son parent.
// C'est l'élève qui invite : un parent ne peut pas se lier à un enfant sans ce code.
import { useCallback, useEffect, useState } from 'react'
import { chargerMesParents, chargerMonCodeParent, creerCodeParent, formaterCodeParent } from '../lib/enfants'
import { formaterHeure, initiales } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import Icone from './Icone'

function finDeValidite(expireLe) {
  const fin = new Date(expireLe)
  const demain = new Date()
  demain.setDate(demain.getDate() + 1)
  const jour = fin.toDateString() === demain.toDateString() ? 'demain' : 'aujourd’hui'
  return `Valable jusqu’à ${jour}, ${formaterHeure(expireLe)} · un seul usage`
}

export default function InvitationParent({ profil, afficherToast }) {
  const [parents, setParents] = useState([])
  const [invitation, setInvitation] = useState(null)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  const charger = useCallback(async () => {
    const [resultat, codeEnCours] = await Promise.all([chargerMesParents(), chargerMonCodeParent(profil.id)])
    setParents(resultat.parents)
    setInvitation(codeEnCours)
  }, [profil.id])

  useEffect(() => {
    charger()
  }, [charger])

  // Dès que le parent a saisi le code, son nom apparaît et le code disparaît
  useTempsReel('liens_parent', charger, `eleve_id=eq.${profil.id}`)

  async function creer() {
    setEnvoiEnCours(true)
    const resultat = await creerCodeParent()
    setEnvoiEnCours(false)
    if (resultat.erreur) {
      afficherToast(resultat.erreur, 'erreur')
      return
    }
    setInvitation({ code: resultat.code, expireLe: resultat.expireLe })
  }

  async function partager() {
    const texte = `Mon code CantiJuste : ${invitation.code}. Ouvre CantiJuste, onglet Mes enfants, puis « Ajouter un enfant ».`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CantiJuste', text: texte })
        return
      }
      await navigator.clipboard.writeText(invitation.code)
      afficherToast('Code copié. Envoie-le à ton parent.')
    } catch {
      // Partage annulé : rien à faire
    }
  }

  return (
    <section className="pile lien-parent" aria-labelledby="titre-lien-parent">
      <span className="surtitre">Ta famille sur CantiJuste</span>

      {parents.length > 0 && (
        <ul className="parents-lies">
          {parents.map((parent) => (
            <li key={parent.id} className="parent-lie">
              <span className="compte-avatar" aria-hidden="true">{initiales(parent.nom)}</span>
              <span className="parent-lie-texte">
                <strong>{parent.nom}</strong>
                <span className="mention">Voit ton solde, tes repas et tes allergies</span>
              </span>
              <Icone nom="coche" className="icone-feuille" />
            </li>
          ))}
        </ul>
      )}

      {invitation ? (
        <div className="ticket ticket-invitation">
          <span className="surtitre">Code pour ton parent</span>
          <p className="ticket-code" aria-label={`Code ${invitation.code.split('').join(' ')}`}>{formaterCodeParent(invitation.code)}</p>
          <p className="mention-ticket">{finDeValidite(invitation.expireLe)}</p>
          <div className="ticket-separation" aria-hidden="true" />
          <p className="ticket-consigne">Sur son téléphone : <strong>Mes enfants › Ajouter un enfant</strong>, puis ce code.</p>
          <div className="ticket-actions">
            <button type="button" className="btn btn-ticket" onClick={partager}>
              <span className="avec-icone"><Icone nom="partager" />Envoyer le code</span>
            </button>
            <button type="button" className="btn-lien-ticket" onClick={creer} disabled={envoiEnCours}>
              {envoiEnCours ? 'Création…' : 'Nouveau code'}
            </button>
          </div>
        </div>
      ) : (
        <div className="invitation-parent">
          <span className="invitation-parent-icone" aria-hidden="true">
            <Icone nom="enfants" />
          </span>
          <div className="invitation-parent-texte">
            <h2 id="titre-lien-parent" className="carte-titre">{parents.length > 0 ? 'Inviter un autre parent' : 'Invite ton parent'}</h2>
            <p className="aide">Il pourra recharger ta carte, voir tes repas et être prévenu en cas d’allergie.</p>
          </div>
          <button type="button" className="btn btn-secondaire" onClick={creer} disabled={envoiEnCours}>
            {envoiEnCours ? 'Création…' : 'Créer mon code'}
          </button>
        </div>
      )}
    </section>
  )
}
