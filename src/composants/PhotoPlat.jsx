// Photo d'un plat dans son cadre arrondi, ou un gros emoji s'il n'a pas encore de photo ; children = pastilles posées dessus.
export default function PhotoPlat({ adresse, nomPlat, vivante = false, children }) {
  return (
    <div className={vivante ? 'photo photo-vivante' : 'photo'}>
      {adresse ? (
        <img src={adresse} alt={nomPlat} loading="lazy" />
      ) : (
        <span className="photo-emoji" aria-hidden="true">🍽️</span>
      )}
      {children}
    </div>
  )
}
