// Contact: big WhatsApp and email buttons.
import Button from '../../shared/ui/Button';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import { whatsappLink } from '../../shared/lib/format';
import { CONTACT_EMAIL, WHATSAPP_NUMBER } from '../../config';

/** Contact screen. */
export default function Contact() {
  const { t } = useLang();
  usePageMeta(t.contactTitle);
  return (
    <div className="page">
      <SectionHeading as="h1" icon="phone" title={t.contactTitle} help={t.contactHelp} />
      <div className="actions">
        <Button icon="whatsapp" href={whatsappLink(WHATSAPP_NUMBER)} target="_blank" rel="noopener noreferrer">{t.contactWhatsapp}</Button>
        <Button tone="blue" icon="mail" href={`mailto:${CONTACT_EMAIL}`}>{t.contactEmail}</Button>
      </div>
    </div>
  );
}
