// Photo d'un plat dans son cadre arrondi, ou une grosse icône s'il n'a pas encore de photo ; children = pastilles posées dessus.
import Icone from './Icone'
export default function PhotoPlat({ adresse, nomPlat, vivante = false, children }) {
  return (
    <div className={vivante ? 'photo photo-vivante' : 'photo'}>
      {adresse ? (
        <img src={adresse} alt={nomPlat} loading="lazy" />
      ) : (
        <Icone nom="a-table" className="photo-icone" />
      )}
      {children}
    </div>
  )
}
