// « Le résumé de la semaine » : 3 phrases et 3 actions, rédigées par l'IA à partir des chiffres SQL (ou construites en JavaScript si l'IA ne répond pas).
export default function ResumeSemaine({ resume, actions, source, enCours }) {
  return (
    <section className="carte pilotage-carte resume-semaine" aria-labelledby="titre-resume">
      <h2 id="titre-resume" className="titre-pilotage">Le résumé de la semaine</h2>

      {enCours && (
        <div className="chargement" aria-label="L’IA rédige le résumé…">
          <div className="squelette squelette-ligne" />
          <div className="squelette squelette-ligne" />
        </div>
      )}

      {!enCours && resume.length === 0 && <p className="aide">Analysez des avis pour voir le résumé.</p>}

      {!enCours && resume.length > 0 && (
        <>
          <p className="resume-texte">{resume.join(' ')}</p>
          <h3 className="surtitre">3 actions pour la semaine</h3>
          <ol className="resume-actions">
            {actions.map((action, index) => (
              <li key={index} className="resume-action">
                <span className="resume-numero" aria-hidden="true">{index + 1}</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
          <p className="mention">
            {source === 'ia'
              ? 'Rédigé par l’IA à partir des chiffres ci-dessous.'
              : 'Phrases construites à partir des chiffres ci-dessous (l’IA n’a pas répondu).'}
          </p>
        </>
      )}
    </section>
  )
}
