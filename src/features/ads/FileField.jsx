// Choose a job ad file. Pictures are made smaller in the browser; big PDFs are refused with a plain message.
import { useId, useState } from 'react';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import { prepareFile } from '../../shared/lib/compress';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/**
 * `value` is { fileUrl, fileType, name?, size?, blob? } or null. `onChange` gets the same shape.
 * A new choice carries `blob` (the file to upload); an existing file only has `fileUrl`.
 */
export default function FileField({ value, onChange, error }) {
  const { t } = useLang();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again
    if (!file) return;
    setProblem('');
    setBusy(true);
    try {
      const { file: ready, fileType, thumb } = await prepareFile(file);
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      onChange({ blob: ready, thumbBlob: thumb || null, fileType, name: file.name, size: ready.size, fileUrl: '', previewUrl: URL.createObjectURL(ready) });
    } catch (err) {
      setProblem(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const preview = value?.previewUrl || value?.fileUrl;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label" id={`${id}-label`}>{t.fFile}</span>
      <p className="field-help">{t.fFileHelp}</p>
      {preview && (
        <div className="file-preview">
          {value.fileType === 'pdf' ? (
            <span className="file-pdf"><Icon name="file" size={48} />{t.pdf}</span>
          ) : (
            <img src={preview} alt="" />
          )}
          {value.name && <span className="file-name">{t.fileReady(value.name, Math.round((value.size || 0) / 1024))}</span>}
        </div>
      )}
      <input id={id} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={pick} aria-labelledby={`${id}-label`} />
      <label htmlFor={id} className="btn btn-outline file-btn">
        <Icon name="upload" size={24} />
        <span>{busy ? t.fileWorking : preview ? t.fileChange : t.fileChoose}</span>
      </label>
      <Notice tone="error">{problem || error}</Notice>
    </div>
  );
}
