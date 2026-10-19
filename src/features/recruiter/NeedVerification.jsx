// Shown instead of the new-ad form while the employer's company is not verified: send the license (number + picture or PDF) for the admin to check.
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

/** `profile` is the logged-in employer's profile. */
export default function NeedVerification({ profile }) {
  const { t } = useLang();
  const request = useAsync(() => api.getMyVerification(), []);
  const [number, setNumber] = useState(profile.raNumber || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: 'success', text: '' });

  const send = async (e) => {
    e.preventDefault();
    if (number.trim().length < 3 || !file?.blob) return setMessage({ tone: 'error', text: t.licenseNeed });
    setBusy(true);
    setMessage({ tone: 'success', text: '' });
    try {
      await api.submitVerification({ licenseNumber: number, file: file.blob });
      setFile(null);
      setMessage({ tone: 'success', text: t.licenseSentDone });
      request.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.verifyNeedTitle}</h2>
      <Notice tone="info">{t.verifyNeedText}</Notice>
      <AsyncView state={request} isEmpty={() => false}>
        {(current) => (
          <>
            {current?.status === 'submitted' && <Notice tone="info">{t.licenseChecking(current.licenseNumber)}</Notice>}
            {current?.status === 'rejected' && <Notice tone="error">{`${t.licenseRejected(current.rejectReason)} ${t.licenseRejectedHelp}`}</Notice>}
            <form className="form" onSubmit={send} noValidate>
              <Field label={t.licenseNumber} help={t.licenseNumberHelp}>
                <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} autoComplete="off" />
              </Field>
              <FileField label={t.licenseFile} help={t.licenseFileHelp} value={file} onChange={setFile} />
              <Notice tone={message.tone}>{message.text}</Notice>
              <Button type="submit" icon="upload" disabled={busy}>{current ? t.licenseResend : t.licenseSend}</Button>
            </form>
          </>
        )}
      </AsyncView>
      <div className="actions">
        <Button to="/dashboard/profile" icon="edit" tone="outline">{t.verifyOpenProfile}</Button>
        <Button to="/dashboard" tone="outline" icon="list">{t.goToAds}</Button>
      </div>
    </section>
  );
}
