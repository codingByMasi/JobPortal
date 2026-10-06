// Employer / admin login. In demo mode it also shows the demo accounts with one tap to fill them in.
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { isDemo } from '../../shared/data';
import { useAuth } from './AuthContext';
import { landingPath } from './landing';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Login screen. Already logged-in people are sent on to their area. */
export default function Login() {
  const { t } = useLang();
  const { user, profile, isAdmin, signIn } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, message: '' });
  const [demoLogins, setDemoLogins] = useState(null);
  usePageMeta(t.loginTitle, undefined, { noindex: true });

  // the demo accounts are loaded only in demo mode, so they never ship to real visitors
  useEffect(() => {
    if (isDemo) import('../../shared/data/demo/seed').then((m) => setDemoLogins(m.DEMO_LOGINS));
  }, []);

  if (user && profile) return <Navigate to={landingPath(location.state?.from, isAdmin)} replace />;

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!values.email.trim()) next.email = t.errRequired;
    if (!values.password) next.password = t.errRequired;
    setErrors(next);
    if (Object.keys(next).length) return;
    setState({ busy: true, message: '' });
    try {
      await signIn(values);
    } catch (err) {
      setState({ busy: false, message: friendlyMessage(err, t) });
    }
  };

  return (
    <div className="page narrow">
      <SectionHeading as="h1" icon="user" title={t.loginTitle} help={t.loginHelp} />
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t.email} error={errors.email}>
          <input type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field label={t.password} error={errors.password}>
          <input type="password" autoComplete="current-password" value={values.password} onChange={set('password')} />
        </Field>
        <Notice tone="error">{state.message}</Notice>
        <Button type="submit" icon="user" disabled={state.busy}>{state.busy ? t.loggingIn : t.loginButton}</Button>
      </form>
      <p className="center"><Link className="text-link" to="/forgot-password">{t.forgotLink}</Link></p>
      <p className="center"><Link className="text-link" to="/signup">{t.noAccount}</Link></p>

      {isDemo && demoLogins && (
        <section className="demo-logins">
          <h2>{t.demoLogins}</h2>
          {[['demoEmployer', demoLogins.recruiter], ['demoAdmin', demoLogins.admin]].map(([label, creds]) => (
            <div key={label} className="demo-login">
              <span><strong>{t[label]}</strong><br />{creds.email} / {creds.password}</span>
              <Button size="sm" tone="outline" onClick={() => setValues({ email: creds.email, password: creds.password })}>{t.useThis}</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
