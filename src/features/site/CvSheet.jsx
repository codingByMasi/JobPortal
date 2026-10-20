// The CV as a clean one-page sheet. It is what gets printed (see .cv-sheet in app.css): plain text only, no pictures.
import { useLang } from '../../shared/i18n/LangContext';
import { cvHasContent, hasExperience, toLines, toList } from '../../shared/lib/cvModel';

/** The sheet for the typed values `cv`. Shows a hint while nothing is typed. */
export default function CvSheet({ cv }) {
  const { t } = useLang();
  if (!cvHasContent(cv)) return <p className="state-text center">{t.cvEmpty}</p>;
  const contact = [cv.phone, cv.email, cv.city].map((s) => s.trim()).filter(Boolean).join('  |  ');
  const jobs = cv.experience.filter(hasExperience);
  const skills = toList(cv.skills);
  const languages = toList(cv.languages);
  const education = toLines(cv.education);
  return (
    <article className="cv-sheet" aria-label={t.cvPreviewTitle}>
      {cv.name.trim() && <h2 className="cv-name">{cv.name.trim()}</h2>}
      {contact && <p className="cv-contact">{contact}</p>}
      {cv.want.trim() && <p className="cv-want">{t.cvLookingFor(cv.want.trim())}</p>}
      {cv.about.trim() && (
        <section><h3>{t.cvSecAbout}</h3><p>{cv.about.trim()}</p></section>
      )}
      {jobs.length > 0 && (
        <section>
          <h3>{t.cvSecExp}</h3>
          {jobs.map((x, i) => (
            <div key={i} className="cv-entry">
              <p><strong>{x.role.trim()}</strong>{x.role.trim() && x.company.trim() ? ' - ' : ''}{x.company.trim()}{x.years.trim() ? ` (${x.years.trim()})` : ''}</p>
              {x.details.trim() && <p>{x.details.trim()}</p>}
            </div>
          ))}
        </section>
      )}
      {skills.length > 0 && <section><h3>{t.cvSecSkills}</h3><p>{skills.join(', ')}</p></section>}
      {languages.length > 0 && <section><h3>{t.cvSecLang}</h3><p>{languages.join(', ')}</p></section>}
      {education.length > 0 && (
        <section><h3>{t.cvSecEdu}</h3><ul>{education.map((l, i) => <li key={i}>{l}</li>)}</ul></section>
      )}
    </article>
  );
}
