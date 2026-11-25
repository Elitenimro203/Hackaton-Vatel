// Onglet Comptoir du rôle cantine : on tape le code, la carte de remise montre le convive et ses allergies, on remet, « Bon appétit ».
import { useCallback, useEffect, useState } from 'react'
import { lireTicket } from '../lib/comptoir'
import { chargerCommandesDuJour, servirRepas } from '../lib/service'
import { dateDuJour, formaterCodeRetrait, formaterDate, formaterHeure, HORAIRE_SERVICE } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import ClavierCode from '../composants/ClavierCode'
import CarteRemise from '../composants/CarteRemise'
import RemiseConfirmee from '../composants/RemiseConfirmee'
import Icone from '../composants/Icone'

// Ticket lu mais pas à remettre : le message affiché sous les cases
function messageRefus(ticket) {
  if (ticket.resultat === 'deja_servi') {
    return `${formaterCodeRetrait(ticket.code_retrait)} déjà servi${ticket.servie_le ? ` à ${formaterHeure(ticket.servie_le)}` : ''}.`
  }
  if (ticket.resultat === 'pas_aujourdhui') return `Ce ticket est pour ${formaterDate(ticket.jour)}.`
  if (ticket.resultat === 'inconnu') return `${formaterCodeRetrait(ticket.code_retrait || '')} : code inconnu. Vérifie avec le convive.`
  return ticket.message
}

export default function Comptoir({ afficherToast }) {
  const [code, setCode] = useState('')
  const [ticket, setTicket] = useState(null)
  const [refus, setRefus] = useState(null)
  const [servi, setServi] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [compteurs, setCompteurs] = useState({ servis: 0, total: 0 })

  const chargerCompteurs = useCallback(async () => {
    const { commandes } = await chargerCommandesDuJour(dateDuJour())
    setCompteurs({ servis: commandes.filter((commande) => commande.statut === 'servie').length, total: commandes.length })
  }, [])

  useEffect(() => {
    chargerCompteurs()
  }, [chargerCompteurs])

  useTempsReel('reservations', chargerCompteurs)

  async function lire(codeComplet) {
    setRefus(null)
    setEnCours(true)
    const resultat = await lireTicket(codeComplet)
    setEnCours(false)
    if (resultat.erreur) {
      afficherToast(resultat.erreur, 'erreur')
      setCode('')
      return
    }
    if (resultat.ticket.resultat === 'a_remettre') {
      setTicket(resultat.ticket)
    } else {
      setRefus(messageRefus(resultat.ticket))
      setCode('')
    }
  }

  async function remettre() {
    setEnCours(true)
    const reponse = await servirRepas(ticket.code_retrait)
    setEnCours(false)
    if (reponse.erreur || !reponse.resultat.ok) {
      afficherToast(reponse.erreur || reponse.resultat.message, 'erreur')
      return
    }
    setServi(ticket)
    setTicket(null)
    chargerCompteurs()
  }

  const recommencer = useCallback(() => {
    setServi(null)
    setTicket(null)
    setRefus(null)
    setCode('')
  }, [])

  if (servi) {
    return <RemiseConfirmee ticket={servi} servis={compteurs.servis} total={compteurs.total} onSuivant={recommencer} />
  }

  if (ticket) {
    return <CarteRemise ticket={ticket} enCours={enCours} onRemettre={remettre} onAnnuler={recommencer} />
  }

  return (
    <section className="pile">
      <div className="espace-entre">
        <span className="surtitre">Comptoir</span>
        <span className="badge badge-succes">Service {HORAIRE_SERVICE}</span>
      </div>
      <div>
        <h1 className="admin-titre">Ton code, s’il te plaît</h1>
        <p className="aide">Tape les 4 chiffres du ticket : la carte du convive s’ouvre toute seule.</p>
      </div>

      {refus && (
        <div className="alerte alerte-erreur" role="alert">
          <Icone nom="croix-ronde" />
          <div>
            <strong>Pas de repas à remettre</strong>
            <p>{refus}</p>
          </div>
        </div>
      )}

      <ClavierCode code={code} onChange={setCode} onComplet={lire} desactive={enCours} erreur={Boolean(refus)} />

      <div className="grille-chiffres">
        <div className="chiffre">
          <span className="chiffre-nombre">{compteurs.servis}</span>
          <span className="chiffre-libelle">repas remis</span>
        </div>
        <div className="chiffre chiffre-safran">
          <span className="chiffre-nombre">{compteurs.total - compteurs.servis}</span>
          <span className="chiffre-libelle">encore attendus</span>
        </div>
      </div>
    </section>
  )
}
