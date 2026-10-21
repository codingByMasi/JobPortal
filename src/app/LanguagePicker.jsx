// A row of language buttons in the footer, each in its own writing, so a person can find theirs.
import { LANGUAGES } from '../shared/i18n';
import { useLang } from '../shared/i18n/LangContext';

/** Choose one of the six languages. The header button still switches between English and Hindi in one tap. */
export default function LanguagePicker() {
  const { t, lang, setLang } = useLang();
  return (
    <div className="lang-picker" role="group" aria-label={t.langPickerLabel}>
      <span className="lang-picker-label">{t.langPickerLabel}</span>
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" className="chip" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.name}</button>
      ))}
    </div>
  );
}
