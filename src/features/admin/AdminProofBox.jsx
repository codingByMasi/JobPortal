// Inside the "Mark as paid" pop-up: the payment proof the employer sent (UTR number + screenshot), so the admin can check the money before marking the ad paid.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** `proof` is the employer's proof for this ad, or null. `onReject(reason)` rejects it (the money was not found). */
export default function AdminProofBox({ proof, busy, onReject }) {
  const { t, lang } = useLang();
  const [shot, setShot] = useState(null); // { url, pdf }
  const [problem, setProblem] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  if (!proof) return <p className="muted">{t.proofNone}</p>;

  const open = async () => {
    setProblem('');
    try {
      setShot({ url: await api.adminGetProofFileUrl(proof.filePath), pdf: /\.pdf$/i.test(proof.filePath) });
    } catch (err) {
      setProblem(friendlyMessage(err, t));
    }
  };

  return (
    <div className="proof-admin">
      <strong>{t.proofTitle}</strong>
      <span>{t.proofRef}: <strong>{proof.reference}</strong></span>
      <span className="muted">{proof.createdAt ? t.proofSentOn(formatDate(proof.createdAt, lang)) : ''}</span>
      <p className="help">{t.proofCheck}</p>
      {proof.status === 'rejected' && <Notice tone="error">{`${t.proofRejectedBadge}: ${proof.rejectReason}`}</Notice>}
      <Notice tone="error">{problem}</Notice>
      {!shot && <Button size="sm" tone="blue" icon="eye" onClick={open}>{t.proofView}</Button>}
      {shot && !shot.pdf && <img className="ad-image" src={shot.url} alt={t.proofTitle} referrerPolicy="no-referrer" />}
      {shot?.pdf && <a className="pdf-open" href={shot.url} target="_blank" rel="noopener noreferrer"><Icon name="file" size={32} />{t.pdfOpen}</a>}
      {proof.status === 'submitted' && !rejecting && <Button size="sm" tone="outline" icon="close" onClick={() => setRejecting(true)}>{t.proofNotFound}</Button>}
      {proof.status === 'submitted' && rejecting && (
        <>
          <Field label={t.proofRejectReason}>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          <Button size="sm" tone="danger" icon="close" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>{t.proofRejectConfirm}</Button>
        </>
      )}
    </div>
  );
}
