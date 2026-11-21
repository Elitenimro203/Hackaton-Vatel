// Guichet du comptoir : grand champ « Code de retrait » (servi dès le 4e chiffre) et grand résultat à côté.
import { useRef, useState } from 'react'
import ResultatService from './ResultatService'

export default function GuichetRetrait({ resultat, numeroResultat, enCours, onServir }) {
  const [code, setCode] = useState('')
  const champ = useRef(null)

  async function envoyer(codeAEnvoyer) {
    if (codeAEnvoyer.length !== 4 || enCours) return
    await onServir(codeAEnvoyer)
    setCode('')
    champ.current?.focus()
  }

  // On garde seulement les chiffres (« CJ · 0812 » collé devient « 0812 ») et on sert au 4e chiffre
  function changerCode(evenement) {
    const chiffres = evenement.target.value.replace(/\D/g, '').slice(-4)
    setCode(chiffres)
    if (chiffres.length === 4) envoyer(chiffres)
  }

  function valider(evenement) {
    evenement.preventDefault()
    envoyer(code)
  }

  return (
    <section className="carte guichet" aria-label="Passage au comptoir">
      <form className="guichet-formulaire pile" onSubmit={valider}>
        <div className="champ champ-code">
          <label htmlFor="code-retrait">Code de retrait</label>
          <input
            ref={champ}
            id="code-retrait"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0812"
            value={code}
            onChange={changerCode}
            aria-describedby="code-retrait-aide"
          />
          <p id="code-retrait-aide" className="champ-message">
            Tape les 4 chiffres du ticket CJ : le repas est servi tout de suite.
          </p>
        </div>
        <button type="submit" className="btn" disabled={enCours || code.length !== 4}>
          {enCours ? 'Vérification…' : 'Servir ce ticket'}
        </button>
      </form>

      <ResultatService key={numeroResultat} resultat={resultat} />
    </section>
  )
}
