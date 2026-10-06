// "Forgot password": the person writes their email and we send a link to make a new password.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** /forgot-password. The answer is the same whether or not the email has an account. */
export default function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState({ busy: false, done: false });
  usePageMeta(t.forgotTitle, undefined, { noindex: true });

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t.errEmailBad);
    setError('');
    setState({ busy: true, done: false });
    try {
      await api.requestPasswordReset(email);
      setState({ busy: false, done: true });
    } catch (err) {
      setError(friendlyMessage(err, t));
      setState({ busy: false, done: false });
    }
  };

  if (state.done) {
    return (
      <div className="page narrow">
        <Notice tone="success">{t.forgotDone}</Notice>
        <Button to="/login" icon="user">{t.loginButton}</Button>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <SectionHeading as="h1" icon="user" title={t.forgotTitle} help={t.forgotHelp} />
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t.email} error={error}>
          <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
        </Field>
        <Button type="submit" icon="mail" disabled={state.busy}>{state.busy ? t.saving : t.forgotSend}</Button>
      </form>
      <p className="center"><Link className="text-link" to="/login">{t.loginButton}</Link></p>
    </div>
  );
}
