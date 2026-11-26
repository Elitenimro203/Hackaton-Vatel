// Onglet Convives du rôle cantine : allergies à surveiller et liste des tickets du jour, en consultation (on sert depuis le Comptoir).
import { useCallback, useEffect, useState } from 'react'
import { chargerAllergiesDuJour } from '../lib/allergies'
import { chargerCommandesDuJour } from '../lib/service'
import { dateDuJour } from '../lib/formatage'
import { useTempsReel } from '../lib/useTempsReel'
import CarteAllergiesDuJour from '../composants/CarteAllergiesDuJour'
import ListeConvives from '../composants/ListeConvives'
import '../commandes.css'

export default function Convives() {
  const aujourdhui = dateDuJour()
  const [commandes, setCommandes] = useState([])
  const [allergies, setAllergies] = useState([])

  const charger = useCallback(async () => {
    const [resultatCommandes, resultatAllergies] = await Promise.all([
      chargerCommandesDuJour(aujourdhui),
      chargerAllergiesDuJour(aujourdhui),
    ])
    setCommandes(resultatCommandes.commandes)
    setAllergies(resultatAllergies.lignes)
  }, [aujourdhui])

  useEffect(() => {
    charger()
  }, [charger])

  useTempsReel('reservations', charger)

  return (
    <section className="pile">
      <div>
        <h1 className="admin-titre">Les convives du jour</h1>
        <p className="aide">Qui vient, quel plat, et qui surveiller avant de servir.</p>
      </div>
      <CarteAllergiesDuJour lignes={allergies} jour={aujourdhui} estAujourdhui />
      <ListeConvives
        commandes={commandes}
        peutServir={false}
        codeEnCours={null}
        onServir={() => {}}
        titre="Tous les tickets"
        aide="Pour remettre un repas, tape son code dans l’onglet Comptoir."
      />
    </section>
  )
}
