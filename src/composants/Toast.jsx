// Message flottant vert ou rouge, et le hook useToast qui l'affiche 3 secondes.
import { useCallback, useEffect, useRef, useState } from 'react'
 
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
 
export default function Toast({ message }) {
  if (!message) return null
 
  return (
    <div key={message.cle} className={`toast toast-${message.type}`} role="status" aria-live="polite">
      {message.type === 'erreur' ? '⚠ ' : '✓ '}
      {message.texte}
    </div>
  )
}
 