// After an admin decision (approve, reject, more days, verify, license rejected): a button that opens WhatsApp to the employer with the message already typed.
import Button from '../../shared/ui/Button';
import { candidateWhatsApp, whatsappLink } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';

/** `tell` is { phone, text } or null. Shows nothing when the employer has no phone number. */
export default function TellEmployer({ tell }) {
  const { t } = useLang();
  if (!tell?.phone) return null;
  return (
    <p className="filter-note">
      <Button size="sm" tone="blue" icon="whatsapp" href={whatsappLink(candidateWhatsApp(tell.phone), tell.text)} target="_blank" rel="noopener noreferrer">{t.tellEmployer}</Button>
    </p>
  );
}
