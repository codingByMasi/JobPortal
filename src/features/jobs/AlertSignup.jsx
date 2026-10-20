// "Get job alerts": a button and a small pop-up. The visitor leaves an email; the country and work they are looking at are used for the alert.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** The alert button for the jobs list. `country` and `category` are the ids chosen in the filters (or empty). */
export default function AlertSignup({ country = '', category = '' }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parts = [country && t.country[country], category && t.category[category]].filter(Boolean);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.subscribeJobAlert({ email, country, category, lang });
      setDone(true);
    } catch (err) {
      setError(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button tone="outline" icon="bell" onClick={() => { setOpen(true); setDone(false); setError(''); }}>{t.alertTitle}</Button>
      {open && (
        <Modal title={t.alertTitle} onClose={() => setOpen(false)}>
          {done ? (
            <>
              <Notice tone="success">{t.alertSent}</Notice>
              <Button tone="outline" onClick={() => setOpen(false)}>{t.close}</Button>
            </>
          ) : (
            <form className="form" onSubmit={send}>
              <p className="help">{t.alertHelp}</p>
              <p className="help"><strong>{parts.length ? t.alertFor(parts.join(', ')) : t.alertForAll}</strong></p>
              <Field label={t.alertEmail}>
                <input type="email" inputMode="email" autoComplete="email" required value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <p className="help">{t.alertConsent}</p>
              <Notice tone="error">{error}</Notice>
              <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.alertSubmit}</Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
