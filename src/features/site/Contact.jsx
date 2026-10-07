// Contact: big WhatsApp and email buttons.
import Button from '../../shared/ui/Button';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import { whatsappLink } from '../../shared/lib/format';
import { useSettings } from '../../shared/settings/SettingsContext';

/** Contact screen. */
export default function Contact() {
  const { t } = useLang();
  usePageMeta(t.contactTitle, t.metaContact);
  const { settings, has } = useSettings();
  return (
    <div className="page">
      <SectionHeading as="h1" icon="phone" title={t.contactTitle} help={t.contactHelp} />
      <div className="actions">
        {has('whatsappNumber') && <Button icon="whatsapp" href={whatsappLink(settings.whatsappNumber)} target="_blank" rel="noopener noreferrer">{t.contactWhatsapp}</Button>}
        {has('contactEmail') && <Button tone="blue" icon="mail" href={`mailto:${settings.contactEmail}`}>{t.contactEmail}</Button>}
      </div>
      {has('grievanceName') && has('grievanceEmail') && (
        <section className="section">
          <h2>{t.grievanceTitle}</h2>
          <p className="help">{t.grievanceText(settings.grievanceName, settings.grievanceEmail)}</p>
        </section>
      )}
    </div>
  );
}
