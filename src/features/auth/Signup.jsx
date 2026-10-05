// Employer signup: company name, phone, email, password.
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useAuth } from './AuthContext';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Signup screen. */
export default function Signup() {
  const { t } = useLang();
  const { user, profile, signUp } = useAuth();
  const [values, setValues] = useState({ companyName: '', phone: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, message: '', confirm: false });
  usePageMeta(t.signupTitle, undefined, { noindex: true });

  if (user && profile) return <Navigate to="/dashboard" replace />;

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!values.companyName.trim()) next.companyName = t.errRequired;
    if (!/^[0-9+ -]{7,20}$/.test(values.phone.trim())) next.phone = t.errPhoneBad;
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = t.errEmailBad;
    if (values.password.length < 8) next.password = t.errWeakPassword;
    setErrors(next);
    if (Object.keys(next).length) return;
    setState({ busy: true, message: '', confirm: false });
    try {
      const { needsEmailConfirm } = await signUp(values);
      setState({ busy: false, message: '', confirm: needsEmailConfirm });
    } catch (err) {
      setState({ busy: false, message: friendlyMessage(err, t), confirm: false });
    }
  };

  if (state.confirm) {
    return (
      <div className="page narrow">
        <Notice tone="success">{t.checkEmail}</Notice>
        <Button to="/login" icon="user">{t.loginButton}</Button>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <SectionHeading as="h1" icon="user" title={t.signupTitle} help={t.signupHelp} />
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t.companyName} error={errors.companyName}>
          <input type="text" autoComplete="organization" value={values.companyName} onChange={set('companyName')} maxLength={120} />
        </Field>
        <Field label={t.phone} error={errors.phone}>
          <input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} maxLength={20} />
        </Field>
        <Field label={t.email} error={errors.email}>
          <input type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field label={t.password} help={t.passwordHelp} error={errors.password}>
          <input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
        <Notice tone="error">{state.message}</Notice>
        <Button type="submit" icon="user" disabled={state.busy}>{state.busy ? t.loggingIn : t.signupButton}</Button>
      </form>
      <p className="center"><Link className="text-link" to="/login">{t.haveAccount}</Link></p>
    </div>
  );
}
