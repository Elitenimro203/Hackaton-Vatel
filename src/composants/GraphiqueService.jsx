// Graphique en barres « Réservés, puis savourés. » : repas réservés (safran) et servis (feuille) par jour de service, avec recharts.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formaterDate, formaterJourMois, formaterNombre } from '../lib/formatage'

// Bulle affichée au toucher ou au survol d'un jour
function BulleJour({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const { reserves, servis } = payload[0].payload
  return (
    <div className="graphique-bulle">
      <strong>{formaterDate(label)}</strong>
      <span><span className="point point-safran" aria-hidden="true" /> {formaterNombre(reserves)} réservés</span>
      <span><span className="point point-feuille" aria-hidden="true" /> {formaterNombre(servis)} servis</span>
      <span className="mention">{formaterNombre(reserves - servis)} non venus</span>
    </div>
  )
}

export default function GraphiqueService({ jours }) {
  return (
    <div className="graphique-service">
      <div className="graphique-legende" aria-hidden="true">
        <span className="pilule-legende"><span className="point point-safran" /> Réservés</span>
        <span className="pilule-legende"><span className="point point-feuille" /> Servis</span>
      </div>

      <div className="graphique-zone" role="img" aria-label={`Repas réservés et servis sur ${jours.length} jours de service`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={jours} barGap={1} barCategoryGap="14%" margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} className="graphique-grille" />
            <XAxis dataKey="jour" tickFormatter={formaterJourMois} tickLine={false} axisLine={false} minTickGap={14} />
            <YAxis tickLine={false} axisLine={false} width={46} allowDecimals={false} />
            <Tooltip content={<BulleJour />} cursor={{ className: 'graphique-curseur' }} />
            <Bar dataKey="reserves" name="Réservés" className="barres-reserves" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="servis" name="Servis" className="barres-servis" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Les mêmes chiffres en texte, pour les lecteurs d'écran */}
      <div className="masque-visuel">
        <table>
          <caption>Repas réservés et servis par jour</caption>
          <thead>
            <tr><th scope="col">Jour</th><th scope="col">Réservés</th><th scope="col">Servis</th></tr>
          </thead>
          <tbody>
            {jours.map((jour) => (
              <tr key={jour.jour}><td>{formaterDate(jour.jour)}</td><td>{jour.reserves}</td><td>{jour.servis}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
