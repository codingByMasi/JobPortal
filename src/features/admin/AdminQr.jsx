// Admin > Settings: upload, replace or remove the shop's own payment QR picture (shown to employers on the payment screen).
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import FileField from '../ads/FileField';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import { useSettings } from '../../shared/settings/SettingsContext';

/** The QR picture box. */
export default function AdminQr() {
  const { t } = useLang();
  const { settings, reload } = useSettings();
  const current = useAsync(async () => (settings.qrPath ? api.getShopQrUrl(settings.qrPath) : ''), [settings.qrPath]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });

  const run = async (work, doneText) => {
    setBusy(true);
    try {
      await work();
      setFile(null);
      await reload();
      setNotice({ tone: 'success', text: doneText });
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const url = current.data || '';
  return (
    <section className="qr-admin" aria-labelledby="qr-title">
      <h2 id="qr-title">{t.qrTitle}</h2>
      <p className="help">{t.qrHelp}</p>
      {url ? <img className="qr" src={url} alt={t.qrAlt} width={200} height={200} referrerPolicy="no-referrer" /> : <p className="muted">{t.qrNone}</p>}
      <FileField label={t.qrFileLabel} help={t.qrFileHelp} imagesOnly value={file} onChange={setFile} />
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <div className="actions">
        {file?.blob && (
          <Button icon="upload" disabled={busy} onClick={() => run(() => api.adminSaveQr(file.blob, settings.qrPath), t.qrSaved)}>
            {url ? t.qrReplace : t.qrUpload}
          </Button>
        )}
        {url && <Button tone="danger" icon="trash" disabled={busy} onClick={() => run(() => api.adminRemoveQr(settings.qrPath), t.qrRemoved)}>{t.qrRemove}</Button>}
      </div>
    </section>
  );
}
