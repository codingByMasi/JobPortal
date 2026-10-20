// A pop-up in the admin Employers tab: the license an employer sent (number + file). The admin checks it, then verifies the employer or rejects the license with a reason.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import ReasonChips from './ReasonChips';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** `request` is the employer's license request. `onVerify()` verifies them, `onReject(reason)` rejects the license. */
export default function AdminLicenseDialog({ employer, request, busy, onClose, onVerify, onReject }) {
  const { t, lang } = useLang();
  const [shot, setShot] = useState(null); // { url, pdf }
  const [problem, setProblem] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const open = async () => {
    setProblem('');
    try {
      setShot({ url: await api.adminGetLicenseFileUrl(request.filePath), pdf: /\.pdf$/i.test(request.filePath) });
    } catch (err) {
      setProblem(friendlyMessage(err, t));
    }
  };

  return (
    <Modal title={t.licenseDialogTitle} onClose={onClose} wide>
      <p className="modal-text"><strong>{employer.companyName || employer.email}</strong> <span className="muted">{employer.email}</span></p>
      <p className="modal-text">{t.licenseNumber}: <strong>{request.licenseNumber}</strong></p>
      <p className="muted">{t.licenseSentOn(formatDate(request.createdAt, lang))}</p>
      {employer.raNumber && <p className="muted">{t.raShort}: {employer.raNumber}</p>}
      <p className="help">{t.licenseCheckHelp}</p>
      {request.status === 'rejected' && <Notice tone="error">{`${t.licenseRejectedBadge}: ${request.rejectReason}`}</Notice>}
      <Notice tone="error">{problem}</Notice>
      {!shot && <Button size="sm" tone="blue" icon="eye" onClick={open}>{t.licenseOpenFile}</Button>}
      {shot && !shot.pdf && <img className="ad-image" src={shot.url} alt={t.licenseDialogTitle} referrerPolicy="no-referrer" />}
      {shot?.pdf && <a className="pdf-open" href={shot.url} target="_blank" rel="noopener noreferrer"><Icon name="file" size={32} />{t.pdfOpen}</a>}
      {request.status === 'submitted' && (
        <div className="actions">
          <Button icon="badge" disabled={busy} onClick={onVerify}>{t.licenseVerify}</Button>
          {!rejecting && <Button tone="outline" icon="close" onClick={() => setRejecting(true)}>{t.licenseNotGood}</Button>}
        </div>
      )}
      {request.status === 'submitted' && rejecting && (
        <>
          <ReasonChips reasons={t.licenseReasons} label={t.reasonChipsLabel} onPick={setReason} />
          <Field label={t.licenseRejectReason}>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          <Button tone="danger" icon="close" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>{t.licenseRejectConfirm}</Button>
        </>
      )}
    </Modal>
  );
}
