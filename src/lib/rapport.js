// Rapport d'activité du mois pour l'admin : lu en SQL (rapport_activite), exporté en CSV pour Excel.
import { supabase } from './supabaseClient'
import { traduireErreur } from './authentification'
import { ecrireCsv, telechargerCsv } from './csv'
import { dateDuJour, formaterDate } from './formatage'

const COLONNES_RAPPORT = [
  { titre: 'Jour', cle: 'jour' },
  { titre: 'Plat', cle: 'plat' },
  { titre: 'Réservés', cle: 'reserves' },
  { titre: 'Servis', cle: 'servis' },
  { titre: 'Non venus', cle: 'non_venus' },
  { titre: 'Recettes (FCFA)', cle: 'recettes' },
  { titre: 'Note moyenne', cle: 'note' },
  { titre: "Nombre d'avis", cle: 'nombre_avis' },
]

// Télécharge le rapport du mois en cours. Renvoie { nombreJours } ou { erreur }.
export async function exporterRapportDuMois() {
  const { data, error } = await supabase.rpc('rapport_activite')
  if (error) return { erreur: traduireErreur(error) }
  if (!data || data.length === 0) return { erreur: 'Aucun menu ce mois-ci : rien à exporter.' }

  const lignes = data.map((ligne) => ({
    ...ligne,
    jour: formaterDate(ligne.jour),
    note: ligne.note === null ? '' : String(ligne.note).replace('.', ','),
  }))
  const total = data.reduce(
    (somme, ligne) => ({
      reserves: somme.reserves + ligne.reserves,
      servis: somme.servis + ligne.servis,
      non_venus: somme.non_venus + ligne.non_venus,
      recettes: somme.recettes + ligne.recettes,
      nombre_avis: somme.nombre_avis + ligne.nombre_avis,
    }),
    { reserves: 0, servis: 0, non_venus: 0, recettes: 0, nombre_avis: 0 },
  )
  lignes.push({ jour: 'Total du mois', plat: '', note: '', ...total })

  telechargerCsv(`cantijuste-rapport-${dateDuJour().slice(0, 7)}.csv`, ecrireCsv(COLONNES_RAPPORT, lignes))
  return { nombreJours: data.length }
}
