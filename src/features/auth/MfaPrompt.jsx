// Second step of an admin login: the 6-digit code from the authenticator app.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import SectionHeading from '../../shared/ui/SectionHeading';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** Shown instead of the admin area until the code is right. `factorId` is the authenticator app; `onDone` runs after a good code. */
export default function MfaPrompt({ factorId, onDone }) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError(t.mfaCodeBad);
    setBusy(true);
    try {
      await api.mfaVerify(factorId, code.trim());
      onDone();
    } catch (err) {
      setError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <SectionHeading as="h1" icon="shield" title={t.mfaPromptTitle} help={t.mfaPromptHelp} />
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t.mfaCode} error={error}>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} />
        </Field>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.loggingIn : t.mfaContinue}</Button>
      </form>
    </div>
  );
}
