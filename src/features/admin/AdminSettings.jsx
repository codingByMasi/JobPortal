// /admin/settings - the WhatsApp number, UPI ID, emails, company name and site address, changed in the app (no code change, no new build).
import { useEffect, useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { api, isDemo } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { badSettings, cleanWhatsapp, isFilledIn, REQUIRED_SETTINGS } from '../../shared/lib/siteSettings';
import { useSettings } from '../../shared/settings/SettingsContext';
import AdminQr from './AdminQr';

const FIELDS = {
  whatsappNumber: { inputMode: 'numeric', maxLength: 20 },
  upiId: { maxLength: 80 },
  upiName: { maxLength: 80 },
  contactEmail: { type: 'email', maxLength: 120 },
  grievanceName: { maxLength: 80 },
  grievanceEmail: { type: 'email', maxLength: 120 },
  companyName: { maxLength: 80 },
  siteUrl: { type: 'url', maxLength: 120 },
};

/** The settings form. Every box has a help line saying where the value is used. */
export default function AdminSettings() {
  const { t } = useLang();
  const { settings, ready, reload } = useSettings();
  const [v, setV] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const [busy, setBusy] = useState(false);

  // start from what is saved; in a real project an unfilled setting shows empty (not the example)
  useEffect(() => {
    if (ready && !v) setV(Object.fromEntries(REQUIRED_SETTINGS.map((name) => [name, isFilledIn(name, settings[name], isDemo) ? settings[name] : ''])));
  }, [ready, settings, v]);

  if (!v) return <p className="state-text center">{t.loading}</p>;

  const submit = async (e) => {
    e.preventDefault();
    const bad = badSettings(v);
    setErrors(Object.fromEntries(bad.map((name) => [name, t.errSettingBad])));
    if (bad.length) return setNotice({ tone: 'error', text: t.errSettingsFix });
    setBusy(true);
    try {
      const clean = { ...v, whatsappNumber: cleanWhatsapp(v.whatsappNumber) };
      await api.adminSaveSettings(Object.fromEntries(Object.entries(clean).map(([k, x]) => [k, String(x).trim()])));
      setV(null);
      await reload();
      setNotice({ tone: 'success', text: t.settingsSaved });
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const field = (name) => (
    <Field key={name} label={t.settingLabel[name]} help={t.settingHelp[name]} error={errors[name]}>
      <input
        type={FIELDS[name].type || 'text'} inputMode={FIELDS[name].inputMode} maxLength={FIELDS[name].maxLength} autoComplete="off"
        value={v[name]} onChange={(e) => setV({ ...v, [name]: e.target.value })}
      />
    </Field>
  );

  return (
    <section className="section narrow-form">
      <p className="help">{t.settingsHelp}</p>
      <Notice tone="info">{t.settingsMoneyWarning}</Notice>
      <form className="form" onSubmit={submit} noValidate>
        <h2>{t.settingsContact}</h2>
        {['whatsappNumber', 'contactEmail', 'grievanceName', 'grievanceEmail'].map(field)}
        <h2>{t.settingsPayment}</h2>
        {['upiId', 'upiName'].map(field)}
        <h2>{t.settingsBusiness}</h2>
        {['companyName', 'siteUrl'].map(field)}
        <Notice tone={notice.tone}>{notice.text}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
      </form>
      <AdminQr />
    </section>
  );
}
