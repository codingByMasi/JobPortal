// The optional "more about the job" boxes of the ad form: salary, experience, vacancies, last date, visa.
import Field from '../../shared/ui/Field';
import { CURRENCIES, EXPERIENCE } from '../../shared/lib/catalog';
import { useLang } from '../../shared/i18n/LangContext';

/** The starting values of the boxes (text) from a saved ad, or empty. */
export function factsStart(source) {
  const text = (x) => (x === null || x === undefined ? '' : String(x));
  return {
    salaryMin: text(source?.salaryMin),
    salaryMax: text(source?.salaryMax),
    currency: source?.currency || '',
    experienceLevel: source?.experienceLevel || '',
    vacancies: text(source?.vacancies),
    lastDate: source?.lastDate ? new Date(source.lastDate).toLocaleDateString('en-CA') : '',
    visaType: source?.visaType || '',
  };
}

/** `v` holds the values, `set(key)` makes the change handler, `errors` has an error text per key. */
export default function JobFactsFields({ v, set, errors }) {
  const { t } = useLang();
  return (
    <fieldset className="facts">
      <legend>{t.factsTitle}</legend>
      <p className="field-help">{t.factsHelp}</p>
      <div className="field-row">
        <Field label={t.fSalaryMin} error={errors.salaryMin}>
          <input type="text" inputMode="numeric" value={v.salaryMin} onChange={set('salaryMin')} maxLength={10} />
        </Field>
        <Field label={t.fSalaryMax} error={errors.salaryMax}>
          <input type="text" inputMode="numeric" value={v.salaryMax} onChange={set('salaryMax')} maxLength={10} />
        </Field>
      </div>
      <Field label={t.fCurrency} error={errors.currency}>
        <select value={v.currency} onChange={set('currency')}>
          <option value="">{t.fCurrencyChoose}</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label={t.fExperience}>
        <select value={v.experienceLevel} onChange={set('experienceLevel')}>
          <option value="">{t.expAny}</option>
          {EXPERIENCE.map((x) => <option key={x} value={x}>{t.exp[x]}</option>)}
        </select>
      </Field>
      <div className="field-row">
        <Field label={t.fVacancies} error={errors.vacancies}>
          <input type="text" inputMode="numeric" value={v.vacancies} onChange={set('vacancies')} maxLength={4} />
        </Field>
        <Field label={t.fLastDate} error={errors.lastDate}>
          <input type="date" value={v.lastDate} onChange={set('lastDate')} />
        </Field>
      </div>
      <Field label={t.fVisa} help={t.fVisaHelp}>
        <input type="text" value={v.visaType} onChange={set('visaType')} maxLength={40} />
      </Field>
    </fieldset>
  );
}
