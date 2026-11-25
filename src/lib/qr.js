// Contenu du QR des tickets (« CJ:0812:2026-11-26 ») et lecture de ce contenu au comptoir.

export function contenuQr(code, jour) {
  return `CJ:${code}:${jour}`
}

// « CJ:0812:2026-11-26 » → '0812' ; un code à 4 chiffres seul est accepté aussi ; sinon null
export function codeDepuisQr(texte) {
  const trouve = /^(?:CJ:)?(\d{4})(?::\d{4}-\d{2}-\d{2})?$/.exec((texte || '').trim())
  return trouve ? trouve[1] : null
}

// Le navigateur sait-il lire un QR avec la caméra ? (Chrome sur Android : oui ; sinon on garde le clavier)
export function scanDisponible() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia)
}
