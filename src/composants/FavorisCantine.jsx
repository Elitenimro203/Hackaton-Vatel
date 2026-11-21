// Bloc « Les favoris de la cantine » : les plats les mieux notés par les élèves, avec photo, note moyenne et nombre d'avis.
import { formaterNombre } from '../lib/formatage'
import Vide from './Vide'

function formaterNote(note) {
  return Number(note).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default function FavorisCantine({ favoris, onVoirMenus }) {
  return (
    <section className="pile" aria-labelledby="titre-favoris">
      <h2 id="titre-favoris" className="titre-pilotage">Les favoris de la cantine</h2>

      {favoris.length === 0 ? (
        <Vide
          emoji="⭐"
          titre="Pas encore d’avis"
          texte="Les notes des élèves apparaîtront ici après les premiers repas."
          libelleBouton="Voir les menus"
          onAction={onVoirMenus}
        />
      ) : (
        <ul className="favoris-liste">
          {favoris.map((favori) => (
            <li key={favori.plat} className="carte favori">
              <div className="photo favori-photo">
                {favori.photo_url && <img src={favori.photo_url} alt="" loading="lazy" />}
              </div>
              <div className="favori-texte">
                <h3 className="nom-plat">{favori.plat}</h3>
                <span className="favori-note">
                  <span aria-hidden="true">★</span> {formaterNote(favori.note)}
                  <span className="masque-visuel"> sur 5</span>
                </span>
                <span className="mention">{formaterNombre(favori.nombre_avis)} avis</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
