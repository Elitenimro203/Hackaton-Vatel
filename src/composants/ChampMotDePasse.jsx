// Champ de mot de passe avec icône de cadenas et bouton œil pour afficher ou masquer ce qu'on tape.
import { useState } from 'react'
import Icone from './Icone'

export default function ChampMotDePasse({ id, libelle, valeur, onChange, autoComplete, aide }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <div className="champ-icone">
        <Icone nom="cadenas" />
        <input
          id={id}
          className="avec-oeil"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={valeur}
          onChange={(evenement) => onChange(evenement.target.value)}
          required
        />
        <button
          type="button"
          className="btn-oeil"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
        >
          <Icone nom={visible ? 'masquer' : 'oeil'} />
        </button>
      </div>
      {aide && <p className="mention">{aide}</p>}
    </div>
  )
}
