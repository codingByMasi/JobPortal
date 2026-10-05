// Privacy and Terms/safety pages: short plain-language bullet lists.
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** `kind` is "privacy" or "terms". */
export default function Legal({ kind }) {
  const { t } = useLang();
  const title = kind === 'privacy' ? t.privacyTitle : t.termsTitle;
  const points = kind === 'privacy' ? t.privacyPoints : t.termsPoints;
  usePageMeta(title);
  return (
    <div className="page">
      <SectionHeading as="h1" icon="shield" title={title} />
      <ul className="legal">
        {points.map((p) => (
          <li key={p}><Icon name="check" size={24} /><span>{p}</span></li>
        ))}
      </ul>
      <p className="legal-note">{t.legalDraft}</p>
    </div>
  );
}
