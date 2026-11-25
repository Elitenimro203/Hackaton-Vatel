// Clavier du comptoir : 4 cases « CJ · 0 8 1 _ » et pavé de 10 chiffres ; le 4e chiffre envoie le code tout seul. Le clavier physique marche aussi.
import { useEffect } from 'react'
import Icone from './Icone'

const TOUCHES = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const LONGUEUR_CODE = 4

export default function ClavierCode({ code, onChange, onComplet, desactive, erreur }) {
  function ajouter(chiffre) {
    if (desactive || code.length >= LONGUEUR_CODE) return
    const nouveau = code + chiffre
    onChange(nouveau)
    if (nouveau.length === LONGUEUR_CODE) onComplet(nouveau)
  }

  function effacerUn() {
    if (!desactive) onChange(code.slice(0, -1))
  }

  // Une douchette ou un clavier USB au comptoir : les chiffres et la touche d'effacement suffisent
  useEffect(() => {
    function surTouche(evenement) {
      if (/^[0-9]$/.test(evenement.key)) ajouter(evenement.key)
      if (evenement.key === 'Backspace') effacerUn()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  })

  const cases = Array.from({ length: LONGUEUR_CODE }, (_, position) => code[position] || '')

  return (
    <div className="pile">
      <div className={erreur ? 'cases-code cases-code-erreur' : 'cases-code'} aria-live="polite" aria-label={`Code saisi : ${code || 'aucun'}`}>
        <span className="cases-code-prefixe">CJ ·</span>
        {cases.map((chiffre, position) => (
          <span key={position} className={position === code.length ? 'case-code actif' : 'case-code'}>
            {chiffre}
          </span>
        ))}
      </div>

      <div className="pave-chiffres">
        {TOUCHES.map((touche) => (
          <button key={touche} type="button" className="touche" onClick={() => ajouter(touche)} disabled={desactive}>
            {touche}
          </button>
        ))}
        <button type="button" className="touche touche-texte" onClick={() => onChange('')} disabled={desactive || !code}>
          Effacer
        </button>
        <button type="button" className="touche" onClick={() => ajouter('0')} disabled={desactive}>
          0
        </button>
        <button type="button" className="touche touche-texte" onClick={effacerUn} disabled={desactive || !code} aria-label="Effacer le dernier chiffre">
          <Icone nom="effacer" />
        </button>
      </div>
    </div>
  )
}
