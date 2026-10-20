// /dashboard/profile - the employer corrects company name, phone and registration number.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { isValidPhone } from '../../shared/lib/phone';

/** My details form. */
export default function Profile() {
  const { t } = useLang();
  const { user, profile, refresh } = useAuth();
  const [v, setV] = useState({ companyName: profile?.companyName || '', phone: profile?.phone || '', raNumber: profile?.raNumber || '', emailNotifications: profile?.emailNotifications !== false });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => {
    setV((x) => ({ ...x, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
    setNotice({ tone: 'success', text: '' });
  };

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    if (!v.companyName.trim()) next.companyName = t.errRequired;
    if (!isValidPhone(v.phone)) next.phone = t.errPhoneBad;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.updateProfile(user.id, v);
      await refresh();
      setNotice({ tone: 'success', text: t.profileSaved });
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.profileTitle}</h2>
      <p className="help">{t.profileResetNote}</p>
      <form className="form" onSubmit={save} noValidate>
        <Field label={t.companyName} error={errors.companyName}>
          <input type="text" autoComplete="organization" value={v.companyName} onChange={set('companyName')} maxLength={120} />
        </Field>
        <Field label={t.phone} error={errors.phone}>
          <input type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} maxLength={20} />
        </Field>
        <Field label={t.raNumber} help={t.raNumberHelp}>
          <input type="text" value={v.raNumber} onChange={set('raNumber')} maxLength={40} />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={v.emailNotifications} onChange={(e) => { setV((x) => ({ ...x, emailNotifications: e.target.checked })); setNotice({ tone: 'success', text: '' }); }} />
          <span><strong>{t.emailPrefLabel}</strong><br /><span className="help">{t.emailPrefHelp}</span></span>
        </label>
        <Notice tone={notice.tone}>{notice.text}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
      </form>
    </section>
  );
}
