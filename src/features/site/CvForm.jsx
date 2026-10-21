// The boxes of the CV maker: personal details, work experience (up to 6 jobs), skills, languages and education. Everything stays in the page.
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import { useLang } from '../../shared/i18n/LangContext';
import { MAX_EXPERIENCE, emptyExperience } from '../../shared/lib/cvModel';

/** `cv` is the typed values, `setCv` replaces them. */
export default function CvForm({ cv, setCv }) {
  const { t } = useLang();
  const set = (key) => (e) => setCv({ ...cv, [key]: e.target.value });
  const setJob = (i, key) => (e) => setCv({ ...cv, experience: cv.experience.map((x, n) => (n === i ? { ...x, [key]: e.target.value } : x)) });
  const addJob = () => setCv({ ...cv, experience: [...cv.experience, emptyExperience()] });
  const removeJob = (i) => setCv({ ...cv, experience: cv.experience.length > 1 ? cv.experience.filter((_, n) => n !== i) : [emptyExperience()] });

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()} aria-label={t.cvTitle}>
      <Field label={t.cvName}><input type="text" autoComplete="name" maxLength={60} value={cv.name} onChange={set('name')} /></Field>
      <Field label={t.cvPhone}><input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={cv.phone} onChange={set('phone')} /></Field>
      <Field label={t.cvEmail}><input type="email" inputMode="email" autoComplete="email" maxLength={80} value={cv.email} onChange={set('email')} /></Field>
      <Field label={t.cvCity}><input type="text" maxLength={60} value={cv.city} onChange={set('city')} /></Field>
      <Field label={t.cvWant}><input type="text" maxLength={80} value={cv.want} onChange={set('want')} /></Field>
      <Field label={t.cvAbout}><textarea rows={3} maxLength={300} value={cv.about} onChange={set('about')} /></Field>

      <h2 className="section-title">{t.cvExpHeading}</h2>
      {cv.experience.map((x, i) => (
        <fieldset key={i} className="cv-job">
          <legend>{`${t.cvExpHeading} ${i + 1}`}</legend>
          <Field label={t.cvRole}><input type="text" maxLength={60} value={x.role} onChange={setJob(i, 'role')} /></Field>
          <Field label={t.cvCompany}><input type="text" maxLength={80} value={x.company} onChange={setJob(i, 'company')} /></Field>
          <Field label={t.cvYears}><input type="text" maxLength={40} value={x.years} onChange={setJob(i, 'years')} /></Field>
          <Field label={t.cvDetails}><textarea rows={2} maxLength={200} value={x.details} onChange={setJob(i, 'details')} /></Field>
          {cv.experience.length > 1 && <Button tone="outline" icon="trash" onClick={() => removeJob(i)}>{t.cvRemoveExp}</Button>}
        </fieldset>
      ))}
      {cv.experience.length < MAX_EXPERIENCE && <Button tone="outline" icon="plus" onClick={addJob}>{t.cvAddExp}</Button>}

      <Field label={t.cvSkills}><textarea rows={2} maxLength={300} value={cv.skills} onChange={set('skills')} /></Field>
      <Field label={t.cvLanguages}><input type="text" maxLength={100} value={cv.languages} onChange={set('languages')} /></Field>
      <Field label={t.cvEducation}><textarea rows={3} maxLength={400} value={cv.education} onChange={set('education')} /></Field>
    </form>
  );
}
