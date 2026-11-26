// QR du ticket de retrait, dessiné en SVG à partir de la grille calculée par la bibliothèque qrcode (pas d'image, pas de HTML injecté).
import { useMemo } from 'react'
import QRCode from 'qrcode'
import { contenuQr } from '../lib/qr'

export default function QrTicket({ code, jour }) {
  const { taille, trace } = useMemo(() => {
    const { modules } = QRCode.create(contenuQr(code, jour), { errorCorrectionLevel: 'M' })
    let chemin = ''
    for (let ligne = 0; ligne < modules.size; ligne++) {
      for (let colonne = 0; colonne < modules.size; colonne++) {
        if (modules.get(ligne, colonne)) chemin += `M${colonne} ${ligne}h1v1h-1z`
      }
    }
    return { taille: modules.size, trace: chemin }
  }, [code, jour])

  return (
    <div className="qr-cadre">
      <svg className="qr" viewBox={`-2 -2 ${taille + 4} ${taille + 4}`} role="img" aria-label="QR code du ticket à montrer au comptoir">
        <path d={trace} />
      </svg>
    </div>
  )
}
