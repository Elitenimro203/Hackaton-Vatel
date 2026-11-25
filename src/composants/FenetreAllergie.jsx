// Fenêtre qui monte du bas avant de réserver un plat à risque : le plat de remplacement compatible, ou « Réserver quand même ».
import { formaterMontant } from '../lib/formatage'
import { alternativeCompatible, listerSansAllergenes, nommerAllergenes } from '../lib/allergenes'
import PhotoPlat from './PhotoPlat'
import Icone from './Icone'
import '../allergies.css'

export default function FenetreAllergie({ menu, profil, risques, prix, envoiEnCours, onReserverAlternative, onReserverQuandMeme, onFermer }) {
  const prenom = profil.nom.trim().split(' ')[0] || 'Toi'
  const avecAlternative = alternativeCompatible(menu, profil.allergies || [], profil.regime || 'aucun')

  return (
    <div className="voile">
      <div className="fenetre-bas" role="alertdialog" aria-modal="true" aria-labelledby="titre-alerte-allergie">
        <div className="espace-entre">
          <span className="surtitre texte-alerte">Ta sécurité d’abord</span>
          <button type="button" className="btn-icone btn-fermer" onClick={onFermer} aria-label="Fermer" disabled={envoiEnCours}>
            <Icone nom="fermer" />
          </button>
        </div>

        <h2 id="titre-alerte-allergie">
          {prenom}, ce plat contient <span className="texte-alerte">{nommerAllergenes(risques)}</span>
        </h2>

        {avecAlternative ? (
          <>
            <h3 className="sous-titre">Tout aussi bon. Compatible.</h3>
            <div className="carte-alternative">
              <PhotoPlat adresse={menu.photo_alternative} nomPlat={menu.plat_alternatif} />
              <div className="carte-alternative-texte">
                <span className="surtitre texte-feuille">Sans {listerSansAllergenes(risques)}</span>
                <p className="nom-plat nom-plat-alternative">{menu.plat_alternatif}</p>
                <span className="prix texte-safran">{formaterMontant(prix)}</span>
              </div>
            </div>
            <button type="button" className="btn" onClick={onReserverAlternative} disabled={envoiEnCours}>
              {envoiEnCours ? 'Réservation…' : `Réserver sans ${listerSansAllergenes(risques)}`}
              <span className="btn-prix">{formaterMontant(prix)}</span>
            </button>
          </>
        ) : (
          <>
            <div className="alerte alerte-info">
              <Icone nom="a-table" />
              <div>
                <strong>Pas de remplacement pour ce plat</strong>
                <p>Le plus sûr : choisir un des autres plats du jour.</p>
              </div>
            </div>
            <button type="button" className="btn" onClick={onFermer} disabled={envoiEnCours}>
              Choisir un autre plat
            </button>
          </>
        )}

        <button type="button" className="btn btn-danger" onClick={onReserverQuandMeme} disabled={envoiEnCours}>
          Réserver quand même
        </button>
        <p className="mention centre">Ton parent recevra une alerte si tu confirmes.</p>
      </div>
    </div>
  )
}
