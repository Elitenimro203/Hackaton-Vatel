// Bandeau discret affiché quand le téléphone perd le réseau : l'appli montre alors les dernières données chargées.
import { useEffect, useState } from 'react'
import Icone from './Icone'

export default function BandeauHorsLigne() {
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine)

  useEffect(() => {
    const passerHorsLigne = () => setHorsLigne(true)
    const revenirEnLigne = () => setHorsLigne(false)
    window.addEventListener('offline', passerHorsLigne)
    window.addEventListener('online', revenirEnLigne)
    return () => {
      window.removeEventListener('offline', passerHorsLigne)
      window.removeEventListener('online', revenirEnLigne)
    }
  }, [])

  if (!horsLigne) return null

  return (
    <div className="bandeau-hors-ligne" role="status">
      <Icone nom="hors-ligne" className="icone-safran" />
      <span>
        <strong>Hors ligne.</strong> Tu vois le dernier menu chargé ; réserver et recharger reviennent avec le réseau.
      </span>
    </div>
  )
}
