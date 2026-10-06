// /admin/security - turn the authenticator app (two-step login) on or off for the admin account.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** Set-up steps: scan the picture, type the first code. */
function Enroll({ onDone }) {
  const { t } = useLang();
  const [setup, setSetup] = useState(null); // { factorId, qr, secret }
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api.mfaEnroll());
    } catch (err) {
      setError(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError(t.mfaCodeBad);
    setBusy(true);
    try {
      await api.mfaVerify(setup.factorId, code.trim());
      onDone();
    } catch (err) {
      setError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <>
        <Notice tone="error">{error}</Notice>
        <Button icon="shield" onClick={start} disabled={busy}>{t.mfaTurnOn}</Button>
      </>
    );
  }
  return (
    <form className="form" onSubmit={confirm} noValidate>
      <ol className="steps">
        <li><span className="step-num">1</span><span>{t.mfaStep1}</span></li>
        <li><span className="step-num">2</span><span>{t.mfaStep2}</span></li>
        <li><span className="step-num">3</span><span>{t.mfaStep3}</span></li>
      </ol>
      <img className="qr" src={setup.qr} alt={t.mfaQrAlt} width="220" height="220" />
      <p className="help">{t.mfaSecretHelp}</p>
      <p><strong className="secret">{setup.secret}</strong></p>
      <Field label={t.mfaCode} error={error}>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} />
      </Field>
      <Button type="submit" icon="check" disabled={busy}>{t.mfaConfirm}</Button>
    </form>
  );
}

/** Security tab of the admin area. */
export default function AdminSecurity() {
  const { t } = useLang();
  const status = useAsync(() => api.mfaStatus(), []);
  const [notice, setNotice] = useState('');

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.mfaTitle}</h2>
      <p className="help">{t.mfaHelp}</p>
      <Notice tone="success">{notice}</Notice>
      <AsyncView state={status} isEmpty={() => false}>
        {(s) => (s.enrolled ? (
          <Notice tone="success">{t.mfaIsOn}</Notice>
        ) : (
          <Enroll onDone={() => { setNotice(t.mfaDone); status.reload(); }} />
        ))}
      </AsyncView>
    </section>
  );
}
