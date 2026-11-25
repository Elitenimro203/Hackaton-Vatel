// Onglet admin « File d'attente » (charte 11.3) : attente avant / avec CantiJuste calculée par simulation de Markov, curseur d'adhésion, guichets conseillés et affluence réelle du jour.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { chargerAffluence, REGLAGES_PAR_DEFAUT } from '../../lib/affluence'
import { chargerProchainJourDeService } from '../../lib/allergies'
import {
  CRENEAUX_SIMULATION,
  guichetsConseilles,
  melangerProfils,
  plageGuichets,
  PROFIL_AVANT,
  preparerCreneaux,
  servisParMinute,
  simulerKolmogorov,
} from '../../lib/fileAttente'
import { dateDuJour, formaterAttente, formaterCreneau, formaterDate, formaterMinutes } from '../../lib/formatage'
import { useTempsReel } from '../../lib/useTempsReel'
import CourbeFile from '../../composants/CourbeFile'
import Vide from '../../composants/Vide'
import Icone from '../../composants/Icone'
import '../../pilotage.css'
import '../../file-attente.css'
import '../../file-attente-admin.css'

const ADHESION_DEPART = 30
const CHOIX_GUICHETS = [1, 2, 3, 4]

const BADGES = {
  calme: { icone: 'feuille', texte: 'Calme', classe: 'creneau-badge creneau-badge-calme' },
  normal: { texte: 'Normal', classe: 'creneau-badge creneau-badge-normal' },
  charge: { icone: 'flamme', texte: 'Chargé', classe: 'creneau-badge creneau-badge-charge' },
}

export default function FileAttente() {
  const [adhesion, setAdhesion] = useState(ADHESION_DEPART)
  const [ticketPrepaye, setTicketPrepaye] = useState(true)
  const [guichets, setGuichets] = useState(REGLAGES_PAR_DEFAUT.guichets)
  const [reglages, setReglages] = useState(REGLAGES_PAR_DEFAUT)
  const [jour, setJour] = useState(dateDuJour())
  const [lignes, setLignes] = useState([])
  const [chargement, setChargement] = useState(true)

  // Affluence réelle du jour de service (aujourd'hui, ou le prochain jour avec un menu)
  const charger = useCallback(async () => {
    const prochain = await chargerProchainJourDeService(dateDuJour())
    const resultat = await chargerAffluence(prochain.jour)
    setJour(prochain.jour)
    setLignes(resultat.erreur ? [] : resultat.creneaux)
    setReglages(resultat.reglages)
    setChargement(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('reservations', charger)

  // Le nombre de guichets des réglages devient le choix de départ (une seule fois, au chargement)
  useEffect(() => {
    setGuichets(Math.min(4, Math.max(1, reglages.guichets)))
  }, [reglages.guichets])

  const muSansTicket = servisParMinute(reglages.sec_sans_ticket)
  const muAvecTicket = servisParMinute(reglages.sec_avec_ticket)
  const mu = ticketPrepaye ? muAvecTicket : muSansTicket

  // Les deux simulations se refont à chaque changement (moins de 100 ms)
  const simulation = useMemo(() => {
    const profil = melangerProfils(adhesion / 100)
    return {
      profil,
      avant: simulerKolmogorov(PROFIL_AVANT, muSansTicket, guichets),
      apres: simulerKolmogorov(profil, mu, guichets),
      guichetsParCreneau: guichetsConseilles(profil.map(Math.round), mu),
    }
  }, [adhesion, guichets, mu, muSansTicket])

  const { avant, apres, profil } = simulation
  const rapport = apres.attenteMoyenne > 0 ? avant.attenteMoyenne / apres.attenteMoyenne : null
  const plage = plageGuichets(simulation.guichetsParCreneau)
  const plusChargeIndex = profil.indexOf(Math.max(...profil))
  const creneauxDuJour = useMemo(() => preparerCreneaux(lignes, reglages), [lignes, reglages])
  const maximumDuJour = Math.max(1, ...lignes.map((ligne) => ligne.reservations))

  return (
    <section className="pile pilotage">
      <div>
        <h1 className="admin-titre">Moins de file à midi.</h1>
        <p className="aide">Calculé avec un modèle de Markov à partir des créneaux réservés.</p>
      </div>

      <div className="pilotage-chiffres">
        <div className="carte-vedette pilotage-vedette">
          <span className="surtitre">L’attente à midi</span>
          <p className="attente-comparaison">
            <span className="attente-avant">{formaterMinutes(avant.attenteMoyenne)}</span>
            <span className="attente-fleche" aria-hidden="true">→</span>
            <span className="attente-apres">{formaterMinutes(apres.attenteMoyenne)}</span>
            {rapport !== null && rapport >= 1.05 && <span className="pastille">÷ {Math.round(rapport)}</span>}
          </p>
          <p className="vedette-repas">attente moyenne, avant / avec CantiJuste</p>
          <p className="mention">300 élèves, {guichets} guichet{guichets > 1 ? 's' : ''}, simulés seconde par seconde.</p>
        </div>

        <div className="chiffre pilotage-chiffre chiffre-safran">
          <span className="chiffre-nombre">{Math.round(avant.fileMax)} → {Math.round(apres.fileMax)}</span>
          <span className="chiffre-libelle">file maximale, en élèves</span>
        </div>

        <div className="chiffre pilotage-chiffre">
          <span className="chiffre-nombre">{formaterCreneau(CRENEAUX_SIMULATION[plusChargeIndex])}</span>
          <span className="chiffre-libelle">créneau le plus chargé · {Math.round(profil[plusChargeIndex])} élèves</span>
        </div>
      </div>

      <section className="carte pilotage-carte" aria-labelledby="titre-guichets">
        <h2 id="titre-guichets" className="titre-pilotage">Les guichets à ouvrir</h2>
        <p className="conseil-guichets">
          <strong>Ouvrez {plage.maximum} guichet{plage.maximum > 1 ? 's' : ''}</strong> de {formaterCreneau(plage.debut)} à{' '}
          {formaterCreneau(plage.fin)}
          {plage.ensuite ? `, ${plage.ensuite} ensuite.` : '.'}
        </p>
        <p className="mention">Le plus petit nombre de guichets qui garde l’attente sous 5 minutes à chaque créneau.</p>
      </section>

      <section className="carte pilotage-carte" aria-labelledby="titre-simulation">
        <h2 id="titre-simulation" className="titre-pilotage">Simulez votre midi</h2>

        <div className="champ">
          <label htmlFor="adhesion">
            Élèves qui suivent le créneau conseillé : <strong className="texte-safran">{adhesion} %</strong>
          </label>
          <input
            id="adhesion"
            className="curseur"
            type="range"
            min="0"
            max="100"
            step="5"
            value={adhesion}
            onChange={(evenement) => setAdhesion(Number(evenement.target.value))}
          />
        </div>

        <div className="reglages-simulation">
          <button
            type="button"
            role="switch"
            aria-checked={ticketPrepaye}
            className={ticketPrepaye ? 'interrupteur actif' : 'interrupteur'}
            onClick={() => setTicketPrepaye((valeur) => !valeur)}
          >
            <span className="interrupteur-bouton" aria-hidden="true" />
            <span>
              Ticket prépayé · {ticketPrepaye ? reglages.sec_avec_ticket : reglages.sec_sans_ticket} s par élève
            </span>
          </button>

          <div role="radiogroup" aria-label="Nombre de guichets" className="pilules-guichets">
            {CHOIX_GUICHETS.map((nombre) => (
              <button
                key={nombre}
                type="button"
                role="radio"
                aria-checked={nombre === guichets}
                className={nombre === guichets ? 'pilule-guichet actif' : 'pilule-guichet'}
                onClick={() => setGuichets(nombre)}
              >
                {nombre} guichet{nombre > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="graphique-legende" aria-hidden="true">
          <span className="pilule-legende"><span className="point point-gris" /> Avant</span>
          <span className="pilule-legende"><span className="point point-safran" /> Avec CantiJuste</span>
        </div>
        <CourbeFile avant={avant.courbe} apres={apres.courbe} />
        <p className="mention">Personnes dans la file, minute par minute, de 11 h 50 à 13 h 30.</p>
      </section>

      <section className="carte pilotage-carte" aria-labelledby="titre-aujourdhui">
        <h2 id="titre-aujourdhui" className="titre-pilotage">Aujourd’hui, créneau par créneau</h2>
        <span className="surtitre premiere-lettre">{formaterDate(jour)} · réservations réelles</span>

        {chargement && <div className="squelette squelette-photo" aria-label="Chargement des créneaux…" />}

        {!chargement && lignes.length === 0 && (
          <Vide
            icone="chronometre"
            titre="Pas encore de créneaux"
            texte="Lancez supabase/patch_file_attente.sql pour activer les créneaux de passage."
          />
        )}

        {!chargement && lignes.length > 0 && (
          <ul className="creneaux-du-jour">
            {creneauxDuJour.map((creneau) => {
              const badgeCreneau = BADGES[creneau.complet ? 'charge' : creneau.badge]
              return (
                <li key={creneau.creneau} className="creneau-ligne">
                  <span className="prevision-jour">{formaterCreneau(creneau.creneau)}</span>
                  <progress className="barre-safran" value={creneau.reservations} max={maximumDuJour}>
                    {creneau.reservations}
                  </progress>
                  <strong className="prevision-valeur">{creneau.reservations}</strong>
                  <span className="creneau-ligne-detail">
                    <span className="mention">{creneau.complet ? 'Complet' : formaterAttente(creneau.attente)}</span>
                    <span className={badgeCreneau.classe}>
                      {badgeCreneau.icone && <Icone nom={badgeCreneau.icone} />}
                      {badgeCreneau.texte}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
