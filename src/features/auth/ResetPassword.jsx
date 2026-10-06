// "New password": opened from the link in the reset email (the link signs the person in for this one step).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { Loading } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from './AuthContext';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** /reset-password. */
export default function ResetPassword() {
  const { t } = useLang();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  usePageMeta(t.resetTitle, undefined, { noindex: true });

  if (status === 'loading') return <div className="page"><Loading /></div>;
  if (!user) {
    return (
      <div className="page narrow">
        <Notice tone="error">{t.resetNeedLink}</Notice>
        <Link className="text-link" to="/forgot-password">{t.forgotLink}</Link>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError(t.errWeakPassword);
    setBusy(true);
    try {
      await api.updatePassword(password);
      navigate('/dashboard', { replace: true, state: { notice: t.resetDone } });
    } catch (err) {
      setError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <SectionHeading as="h1" icon="user" title={t.resetTitle} help={t.resetHelp} />
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t.password} help={t.passwordHelp} error={error}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
        </Field>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.resetSave}</Button>
      </form>
    </div>
  );
}
