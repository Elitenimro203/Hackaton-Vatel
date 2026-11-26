// Un plat au choix du jour, en ligne compacte : vignette, nom, ce qui ne va pas au profil, prix ; toucher ouvre la fiche.
import { prixPourProfil } from '../lib/menus'
import { problemeDuPlat } from '../lib/allergenes'
import { formaterMontant } from '../lib/formatage'
import Icone from './Icone'

// etat : 'libre' (on peut réserver), 'reserve' (c'est son repas du jour), 'autre' (il a déjà choisi un autre plat), 'ferme'
export default function ChoixPlat({ menu, profil, etat = 'libre', onOuvrir }) {
  const probleme = problemeDuPlat(menu, profil)
  const classes = ['choix-plat', etat === 'reserve' && 'choix-plat-reserve', etat === 'autre' && 'choix-plat-eteint']
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} onClick={() => onOuvrir(menu)} disabled={etat === 'autre'}>
      <span className="choix-plat-vignette">
        {menu.photo_url ? <img src={menu.photo_url} alt="" loading="lazy" /> : <Icone nom="a-table" />}
      </span>
      <span className="choix-plat-texte">
        <span className="nom-plat choix-plat-nom">{menu.plat}</span>
        {etat === 'reserve' && <span className="mention texte-feuille avec-icone"><Icone nom="coche" />Ton repas du jour</span>}
        {etat !== 'reserve' && probleme && <span className="mention-danger"><Icone nom="alerte" /> {probleme}</span>}
        {etat !== 'reserve' && !probleme && <span className="mention texte-feuille avec-icone"><Icone nom="bouclier" />Pour toi</span>}
      </span>
      <span className="prix texte-safran">{formaterMontant(prixPourProfil(menu, profil))}</span>
    </button>
  )
}
