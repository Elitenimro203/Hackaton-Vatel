// Message flottant vert ou rouge en haut de l'écran (affiché par le hook useToast).
import Icone from './Icone'

export default function Toast({ message }) {
  if (!message) return null

  return (
    <div key={message.cle} className={`toast toast-${message.type}`} role="status" aria-live="polite">
      <Icone nom={message.type === 'erreur' ? 'alerte' : 'coche-ronde'} className="toast-icone" />
      <span>{message.texte}</span>
    </div>
  )
}
