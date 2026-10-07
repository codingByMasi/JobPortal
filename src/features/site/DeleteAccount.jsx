// /delete-account: anyone can ask us to delete their account and data. An admin checks the request and does it by hand.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Account deletion request form. */
export default function DeleteAccount() {
  const { t } = useLang();
  usePageMeta(t.deleteTitle, t.metaDelete);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setFieldError(t.errEmailBad);
    setFieldError('');
    setBusy(true);
    try {
      await api.requestAccountDeletion({ email, note });
      setDone(true);
    } catch (err) {
      setError(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow-form">
      <SectionHeading as="h1" icon="trash" title={t.deleteTitle} help={t.deleteIntro} />
      <ul className="legal">
        {t.deleteHow.map((p) => <li key={p}><Icon name="check" size={24} /><span>{p}</span></li>)}
      </ul>
      {done ? (
        <Notice tone="success">{t.deleteDone}</Notice>
      ) : (
        <form className="form" onSubmit={send} noValidate>
          <Field label={t.deleteEmail} error={fieldError}>
            <input type="email" inputMode="email" autoComplete="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t.deleteNote}>
            <textarea rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Notice tone="error">{error}</Notice>
          <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.deleteSend}</Button>
        </form>
      )}
    </div>
  );
}
