// "Report this ad": a small pop-up form. The report is saved in the database and an admin reviews it.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

const REASONS = ['asked_money', 'fake_company', 'wrong_details', 'other'];

/** The button and its pop-up for one ad. */
export default function ReportAd({ job }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [v, setV] = useState({ reason: 'asked_money', message: '', contact: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.reportAd({ jobId: job.id, reason: v.reason, message: v.message, contact: v.contact });
      setDone(true);
    } catch (err) {
      setError(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button tone="outline" icon="alert" onClick={() => { setOpen(true); setDone(false); }}>{t.reportAd}</Button>
      {open && (
        <Modal title={t.reportTitle} onClose={() => setOpen(false)}>
          {done ? (
            <>
              <Notice tone="success">{t.reportDone}</Notice>
              <Button tone="outline" onClick={() => setOpen(false)}>{t.close}</Button>
            </>
          ) : (
            <form className="form" onSubmit={send}>
              <p className="help">{t.reportHelp}</p>
              <Field label={t.reportWhy}>
                <select value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })}>
                  {REASONS.map((r) => <option key={r} value={r}>{t.reportReasons[r]}</option>)}
                </select>
              </Field>
              <Field label={t.reportMessage}>
                <textarea rows={3} value={v.message} maxLength={300} onChange={(e) => setV({ ...v, message: e.target.value })} />
              </Field>
              <Field label={t.reportContact} help={t.reportContactHelp}>
                <input type="tel" inputMode="numeric" value={v.contact} maxLength={20} onChange={(e) => setV({ ...v, contact: e.target.value })} />
              </Field>
              <Notice tone="error">{error}</Notice>
              <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.reportSend}</Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
