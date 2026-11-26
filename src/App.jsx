// Racine de l'appli : écoute la session, charge le profil et affiche l'écran du rôle connecté.
import { useCallback, useEffect, useState } from 'react'
import { chargerProfil, ecouterSession, seDeconnecter } from './lib/authentification'
import { useTempsReel } from './lib/useTempsReel'
import { useToast } from './composants/useToast'
import EnTete from './composants/EnTete'
import BandeauHorsLigne from './composants/BandeauHorsLigne'
import Accueil from './ecrans/Accueil'
import Inscription from './ecrans/Inscription'
import Eleve from './ecrans/Eleve'
import Parent from './ecrans/Parent'
import Admin from './ecrans/Admin'

const ECRANS_PAR_ROLE = { eleve: Eleve, parent: Parent, admin: Admin }

function EcranChargement() {
  return (
    <main className="page">
      <div className="chargement" aria-label="Chargement…">
        <div className="squelette squelette-photo" />
        <div className="squelette squelette-ligne" />
        <div className="squelette" />
      </div>
    </main>
  )
}

export default function App() {
  const { toast, afficherToast } = useToast()
  const [session, setSession] = useState(undefined)
  const [profil, setProfil] = useState(null)
  const [erreurProfil, setErreurProfil] = useState(null)
  const [afficherInscription, setAfficherInscription] = useState(false)

  const idUtilisateur = session?.user?.id ?? null

  useEffect(() => ecouterSession(setSession), [])

  const rechargerProfil = useCallback(async () => {
    if (!idUtilisateur) return
    const resultat = await chargerProfil(idUtilisateur)
    setProfil(resultat.profil)
    setErreurProfil(resultat.erreur || (resultat.profil ? null : 'Profil introuvable pour ce compte.'))
  }, [idUtilisateur])

  useEffect(() => {
    setProfil(null)
    setErreurProfil(null)
    setAfficherInscription(false)
    rechargerProfil()
  }, [rechargerProfil])

  // Le solde et le rôle se mettent à jour tout seuls quand la ligne du profil change
  useTempsReel(idUtilisateur ? 'profiles' : null, rechargerProfil, idUtilisateur ? `id=eq.${idUtilisateur}` : null)

  if (session === undefined) return <EcranChargement />

  if (!session) {
    return (
      <>
        {afficherInscription ? (
          <Inscription onRetour={() => setAfficherInscription(false)} afficherToast={afficherToast} />
        ) : (
          <Accueil onCreerCompte={() => setAfficherInscription(true)} afficherToast={afficherToast} />
        )}
        {toast}
      </>
    )
  }

  if (erreurProfil) {
    return (
      <main className="page">
        <EnTete nom="" />
        <div className="alerte alerte-erreur" role="alert">
          <strong>Impossible de charger ton profil</strong>
          <p>{erreurProfil}</p>
        </div>
        <button type="button" className="btn btn-secondaire" onClick={rechargerProfil}>
          Réessayer
        </button>
        <button type="button" className="btn btn-danger" onClick={seDeconnecter}>
          Se déconnecter
        </button>
      </main>
    )
  }

  if (!profil) return <EcranChargement />

  const EcranRole = ECRANS_PAR_ROLE[profil.role]

  // L'admin a une mise en page large sur PC (barre latérale + grille)
  return (
    <main className={profil.role === 'admin' ? 'page-admin' : 'page'}>
      <BandeauHorsLigne />
      <EnTete nom={profil.nom} />
      <EcranRole profil={profil} afficherToast={afficherToast} onProfilModifie={rechargerProfil} />
      {toast}
    </main>
  )
}
