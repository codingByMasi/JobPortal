// The pop-ups for the extra admin buttons on one ad: give more days (with a reason) and give a free ad (with a note).
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import { adReference } from '../../shared/lib/adReference';
import { useLang } from '../../shared/i18n/LangContext';

/** More days for a live or hidden ad. The reason is saved in the admin log. */
export function ExtendDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const valid = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365 && reason.trim().length >= 3;
  return (
    <Modal title={t.extendTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong> <span className="muted">{adReference(job.id)}</span></p>
      <Field label={t.extendDays}>
        <input type="number" inputMode="numeric" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Field label={t.extendReason} help={t.extendReasonHelp}>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </Field>
      <Button icon="check" disabled={busy || !valid} onClick={() => onConfirm(Number(days), reason)}>{t.extendConfirm}</Button>
    </Modal>
  );
}

/** A free ad: payment of 0 marked "complimentary", with a note that says why. */
export function FreeAdDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [note, setNote] = useState('');
  return (
    <Modal title={t.freeAdTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong> <span className="muted">{adReference(job.id)}</span></p>
      <p className="modal-text">{t.freeAdText}</p>
      <Field label={t.freeAdNote} help={t.freeAdNoteHelp}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
      <Button icon="check" disabled={busy || note.trim().length < 3} onClick={() => onConfirm(note)}>{t.freeAdConfirm}</Button>
    </Modal>
  );
}
