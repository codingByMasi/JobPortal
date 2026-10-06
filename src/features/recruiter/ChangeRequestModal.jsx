// Pop-up where an employer asks us to change a paid ad (paid ads cannot be edited by the employer).
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** `job` is the ad; `onSent` runs after the request is saved; `onClose` closes the pop-up. */
export default function ChangeRequestModal({ job, onClose, onSent }) {
  const { t } = useLang();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (message.trim().length < 3) return setError(t.errNeedMessage);
    setBusy(true);
    setError('');
    try {
      await api.createChangeRequest({ jobId: job.id, message });
      onSent();
    } catch (err) {
      setError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <Modal title={t.requestTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong></p>
      <p className="help">{t.requestHelp}</p>
      <form className="form" onSubmit={send} noValidate>
        <Field label={t.requestLabel}>
          <textarea rows={4} value={message} maxLength={300} onChange={(e) => { setMessage(e.target.value); setError(''); }} />
        </Field>
        <Notice tone="error">{error}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.requestSend}</Button>
      </form>
    </Modal>
  );
}
