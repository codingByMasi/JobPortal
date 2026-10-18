// "After you pay: send proof" on the payment screen: the UTR number and a screenshot. The admin checks them in the bank before marking the ad paid.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import FileField from '../ads/FileField';

/** Send or re-send the proof for one ad. */
export default function ProofForm({ jobId }) {
  const { t } = useLang();
  const proof = useAsync(() => api.getMyPaymentProof(jobId), [jobId]);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: 'success', text: '' });

  const send = async (e) => {
    e.preventDefault();
    if (!reference.trim() || !file?.blob) return setMessage({ tone: 'error', text: t.payProofNeed });
    setBusy(true);
    setMessage({ tone: 'success', text: '' });
    try {
      await api.submitPaymentProof({ jobId, reference, file: file.blob });
      setReference('');
      setFile(null);
      setMessage({ tone: 'success', text: t.payProofSentDone });
      proof.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="proof-box">
      <h3 className="section-title">{t.payProofTitle}</h3>
      <p className="help">{t.payProofHelp}</p>
      <AsyncView state={proof} isEmpty={() => false}>
        {(current) => (
          <>
            {current?.status === 'submitted' && <Notice tone="info">{t.payProofSubmitted(current.reference)}</Notice>}
            {current?.status === 'rejected' && (
              <Notice tone="error">{`${t.payProofRejected(current.rejectReason)} ${t.payProofRejectedHelp}`}</Notice>
            )}
            <form className="form" onSubmit={send} noValidate>
              <Field label={t.payProofRef} help={t.payProofRefHelp}>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={40} autoComplete="off" />
              </Field>
              <FileField label={t.payProofFile} help={t.payProofFileHelp} value={file} onChange={setFile} />
              <Notice tone={message.tone}>{message.text}</Notice>
              <Button type="submit" icon="upload" disabled={busy}>{current ? t.payProofResend : t.payProofSend}</Button>
            </form>
          </>
        )}
      </AsyncView>
    </section>
  );
}
