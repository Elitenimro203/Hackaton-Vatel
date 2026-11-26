// Hook : relance une fonction dès qu'une table Supabase change (temps réel).
import { useEffect, useRef } from 'react'
import { ecouterTable } from './tempsReel'

// table : nom de la table (null pour ne rien écouter) ; filtre facultatif, ex. 'eleve_id=eq.xxx'
export function useTempsReel(table, relancer, filtre = null) {
  const fonctionActuelle = useRef(relancer)

  useEffect(() => {
    fonctionActuelle.current = relancer
  }, [relancer])

  useEffect(() => {
    if (!table) return undefined
    return ecouterTable(table, filtre, () => fonctionActuelle.current())
  }, [table, filtre])
}
