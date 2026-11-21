// Écran de départ : vérifie que l'appli parle bien à Supabase.
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
 
export default function App() {
  const [etat, setEtat] = useState({ chargement: true, erreur: null })
 
  useEffect(() => {
    supabase
      .from('menus')
      .select('id', { count: 'exact', head: true })
      .then(({ error }) => setEtat({ chargement: false, erreur: error }))
  }, [])
 
  return (
    <main className="page">
      <header className="entete">
        <div className="logo">
          Canti<em>Juste</em>
          <div className="surtitre">Le bon repas, pour la bonne personne</div>
        </div>
      </header>
 
      {etat.chargement && <p className="aide">Connexion à Supabase...</p>}
      {!etat.chargement && !etat.erreur && (
        <div className="alerte alerte-succes">
          <strong>Connexion Supabase OK</strong>
        </div>
      )}
      {etat.erreur && (
        <div className="alerte alerte-erreur">
          <strong>Erreur Supabase</strong>
          <p>{etat.erreur.message}</p>
        </div>
      )}
    </main>
  )
}
 