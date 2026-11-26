// Scanner du comptoir : caméra arrière, viseur safran, lecture du QR par le navigateur (BarcodeDetector) ; renvoie le code à 4 chiffres.
import { useEffect, useRef, useState } from 'react'
import { codeDepuisQr } from '../lib/qr'
import Icone from './Icone'

const PAUSE_ENTRE_LECTURES = 250
// Le même QR resté devant la caméra n'est relu qu'après ce délai (évite de relire en boucle un ticket refusé)
const DELAI_MEME_CODE = 4000

// derniereLecture : ref gardée par l'écran parent, pour ne pas rouvrir un ticket qu'on vient de fermer
export default function ScannerQr({ actif, derniereLecture, onCode, onImpossible }) {
  const video = useRef(null)
  const [reconnu, setReconnu] = useState(null)

  useEffect(() => {
    if (!actif) return undefined
    let flux = null
    let minuteur = null
    let arrete = false
    const detecteur = new window.BarcodeDetector({ formats: ['qr_code'] })

    async function lireUneImage() {
      if (arrete) return
      try {
        const trouves = await detecteur.detect(video.current)
        const code = trouves.map((trouve) => codeDepuisQr(trouve.rawValue)).find(Boolean)
        const dejaLu = code === derniereLecture.current.code && Date.now() - derniereLecture.current.moment < DELAI_MEME_CODE
        if (code && !dejaLu) {
          derniereLecture.current = { code, moment: Date.now() }
          navigator.vibrate?.(60)
          setReconnu(code)
          onCode(code)
          return
        }
      } catch {
        // Image pas encore prête : on réessaie au tour suivant
      }
      minuteur = setTimeout(lireUneImage, PAUSE_ENTRE_LECTURES)
    }

    async function demarrer() {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (arrete) return
        video.current.srcObject = flux
        await video.current.play()
        lireUneImage()
      } catch {
        if (!arrete) onImpossible('Caméra indisponible ou refusée. Tape le code à la main.')
      }
    }

    setReconnu(null)
    demarrer()
    return () => {
      arrete = true
      clearTimeout(minuteur)
      flux?.getTracks().forEach((piste) => piste.stop())
    }
  }, [actif, derniereLecture, onCode, onImpossible])

  return (
    <div className={reconnu ? 'scanner scanner-reconnu' : 'scanner'}>
      <video ref={video} className="scanner-video" muted playsInline aria-label="Image de la caméra" />
      <p className="scanner-consigne">{reconnu ? 'QR reconnu' : 'Vise le QR du ticket'}</p>
      <div className="viseur" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        {!reconnu && <span className="viseur-ligne" />}
      </div>
      {reconnu && (
        <span className="badge badge-succes scanner-badge">
          <Icone nom="coche" />
          CJ · {reconnu}
        </span>
      )}
    </div>
  )
}
