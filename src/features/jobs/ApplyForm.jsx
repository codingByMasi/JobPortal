// "Apply here" form on a job page: saves the candidate's details and shows a clear success message.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { isValidPhone } from '../../shared/lib/phone';

const EMPTY = { name: '', phone: '', city: '', message: '' };

/** Candidate apply form for one job. */
export default function ApplyForm({ job }) {
  const { t } = useLang();
  const [values, setValues] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ status: 'idle', message: '' });

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = t.errNameNeeded;
    if (!isValidPhone(values.phone)) next.phone = t.errPhoneBad;
    if (!consent) next.consent = t.errConsentNeeded;
    setErrors(next);
    if (Object.keys(next).length) return;
    setState({ status: 'sending', message: '' });
    try {
      await api.submitApplication({ jobId: job.id, ...values });
      setState({ status: 'done', message: '' });
      setValues(EMPTY);
      setConsent(false);
    } catch (err) {
      setState({ status: 'error', message: friendlyMessage(err, t) });
    }
  };

  if (state.status === 'done') {
    return (
      <section className="apply" aria-live="polite">
        <div className="apply-done">
          <Icon name="check" size={48} />
          <p>{t.applyDone}</p>
          <Button tone="outline" onClick={() => setState({ status: 'idle', message: '' })}>{t.applyAgain}</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="apply">
      <h2>{t.applyTitle}</h2>
      <p className="help">{t.applyHelp}</p>
      <form onSubmit={submit} noValidate>
        <Field label={t.applyName} error={errors.name}>
          <input type="text" autoComplete="name" value={values.name} onChange={set('name')} maxLength={100} />
        </Field>
        <Field label={t.applyPhone} error={errors.phone}>
          <input type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} maxLength={20} />
        </Field>
        <Field label={t.applyCity}>
          <input type="text" autoComplete="address-level2" value={values.city} onChange={set('city')} maxLength={80} />
        </Field>
        <Field label={t.applyMessage}>
          <textarea rows={3} value={values.message} onChange={set('message')} maxLength={500} />
        </Field>
        <label className={`check${errors.consent ? ' has-error' : ''}`}>
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: undefined })); }} />
          <span>{t.applyConsent}</span>
        </label>
        {errors.consent && <p className="field-error" role="alert">{errors.consent}</p>}
        <Notice tone="error">{state.message}</Notice>
        <Button type="submit" icon="check" disabled={state.status === 'sending'}>
          {state.status === 'sending' ? t.applySending : t.applySend}
        </Button>
      </form>
    </section>
  );
}
