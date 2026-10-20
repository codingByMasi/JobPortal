// The pop-ups of the admin ads list: see the ad file, reject (with reason), mark as paid (with reference), delete.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import { adReference } from '../../shared/lib/adReference';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import ReasonChips from './ReasonChips';

/** The ad exactly as visitors will see it: the picture, or a big link to the PDF, plus the details text. */
export function AdFileDialog({ job, onClose }) {
  const { t } = useLang();
  return (
    <Modal title={t.viewAdTitle} onClose={onClose} wide>
      <p className="modal-text"><strong>{job.title}</strong> <span className="muted">{adReference(job.id)}</span></p>
      {!job.fileUrl && <p className="muted">{t.noFile}</p>}
      {job.fileUrl && job.fileType !== 'pdf' && <img className="ad-image" src={job.fileUrl} alt={job.title} referrerPolicy="no-referrer" />}
      {job.fileUrl && job.fileType === 'pdf' && (
        <a className="pdf-open" href={job.fileUrl} target="_blank" rel="noopener noreferrer"><Icon name="file" size={32} />{t.pdfOpen}</a>
      )}
      {job.details && <p className="modal-text">{job.details}</p>}
    </Modal>
  );
}

/** Approving asks how many days the ad stays live; it goes live now and ends after that many days. */
export function ApproveDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [days, setDays] = useState('30');
  const valid = Number.isInteger(+days) && +days >= 1 && +days <= 365;
  return (
    <Modal title={t.approveTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong> <span className="muted">{adReference(job.id)}</span></p>
      <p className="modal-text">{t.approveText}</p>
      <Field label={t.approveDays} error={valid ? '' : t.errRequired}>
        <input type="number" inputMode="numeric" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Button icon="check" disabled={busy || !valid} onClick={() => onConfirm(+days)}>{t.approveConfirm}</Button>
    </Modal>
  );
}

/** Reject needs a reason, which the employer will read. */
export function RejectDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  return (
    <Modal title={t.rejectTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong></p>
      <ReasonChips reasons={t.rejectReasons} label={t.reasonChipsLabel} onPick={setReason} />
      <Field label={t.rejectReason}>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
      <Button tone="danger" icon="close" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason)}>{t.rejectConfirm}</Button>
    </Modal>
  );
}

/** Mark as paid asks for the bank reference number, so one payment cannot be used for two ads. Shows the employer's payment proof when there is one. */
export function PaidDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [reference, setReference] = useState('');
  const price = job.finalPricePaise ?? job.priceAtOrder ?? job.package?.pricePaise ?? 0;
  return (
    <Modal title={t.markPaidTitle} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong> <span className="muted">{adReference(job.id)}</span></p>
      <p className="modal-text">{t.markPaidText(formatPrice(price))}</p>
      <Field label={t.payReferenceLabel} help={t.payReferenceHelp}>
        <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
      </Field>
      <Button icon="rupee" disabled={busy || !reference.trim()} onClick={() => onConfirm(reference.trim())}>{t.markPaid}</Button>
    </Modal>
  );
}

/** Approve many waiting ads at once, all for the same number of days. */
export function BulkApproveDialog({ count, busy, onClose, onConfirm }) {
  const { t } = useLang();
  const [days, setDays] = useState('30');
  const valid = Number.isInteger(+days) && +days >= 1 && +days <= 365;
  return (
    <Modal title={t.bulkApproveTitle} onClose={onClose}>
      <p className="modal-text">{t.bulkApproveText(count)}</p>
      <Field label={t.approveDays} error={valid ? '' : t.errRequired}>
        <input type="number" inputMode="numeric" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <Button icon="check" disabled={busy || !valid} onClick={() => onConfirm(+days)}>{t.bulkApproveConfirm(count)}</Button>
    </Modal>
  );
}

/** Asks before deleting. */
export function DeleteDialog({ job, busy, onClose, onConfirm }) {
  const { t } = useLang();
  return (
    <Modal title={t.deleteAsk} onClose={onClose}>
      <p className="modal-text"><strong>{job.title}</strong></p>
      <p className="modal-text">{t.deleteText}</p>
      <Button tone="danger" icon="trash" disabled={busy} onClick={onConfirm}>{t.yesDelete}</Button>
    </Modal>
  );
}
