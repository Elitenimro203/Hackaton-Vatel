// Hook useToast : affiche un message vert ou rouge pendant 3 secondes, un seul à la fois.
import { useCallback, useEffect, useRef, useState } from 'react'
import Toast from './Toast'

const DUREE_TOAST = 3000

export function useToast() {
  const [message, setMessage] = useState(null)
  const minuteur = useRef(null)

  const afficherToast = useCallback((texte, type = 'succes') => {
    clearTimeout(minuteur.current)
    setMessage({ texte, type, cle: Date.now() })
    minuteur.current = setTimeout(() => setMessage(null), DUREE_TOAST)
  }, [])

  useEffect(() => () => clearTimeout(minuteur.current), [])

  return { toast: <Toast message={message} />, afficherToast }
}
