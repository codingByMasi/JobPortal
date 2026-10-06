// The ad form, used four ways:
//   new         employer posts an ad (picks a package, then goes to payment)
//   edit        employer edits an ad that is still waiting for payment
//   admin-new   admin adds an ad that goes live at once (no payment)
//   admin-edit  admin edits any field of any ad
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import FileField from './FileField';
import Notice from '../../shared/ui/Notice';
import PackagePicker from './PackagePicker';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { CATEGORIES, COUNTRIES } from '../../shared/lib/catalog';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { toDateString } from '../../shared/data/mappers';
import { formatPrice } from '../../shared/lib/money';
import { isValidWhatsapp, normalizeWhatsapp } from '../../shared/lib/phone';

const endOfDay = (dateString) => {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 0).getTime();
};

/** `job` for edit modes; `renewFrom` pre-fills a new ad from an ended one. `onSaved(job)` runs after saving. */
export default function JobForm({ mode, job, renewFrom, packages, onSaved }) {
  const { t } = useLang();
  const { user, profile } = useAuth();
  const isAdmin = mode.startsWith('admin');
  const isEdit = mode === 'edit' || mode === 'admin-edit';
  const source = job || renewFrom;

  const [v, setV] = useState(() => ({
    title: source?.title || '',
    company: source?.company || profile?.companyName || '',
    country: source?.country || 'uae',
    city: source?.city || '',
    category: source?.category || 'plumber',
    whatsapp: normalizeWhatsapp(source?.whatsapp || profile?.phone || ''),
    details: source?.details || '',
    packageId: job?.packageId || renewFrom?.packageId || '',
    days: '30',
    expires: job?.expiresAt ? toDateString(job.expiresAt) : '',
  }));
  const [file, setFile] = useState(
    source?.fileUrl
      ? { fileUrl: source.fileUrl, filePath: source.filePath, fileType: source.fileType, thumbUrl: source.thumbUrl, thumbPath: source.thumbPath, copy: Boolean(renewFrom) }
      : null,
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearError = (key) => setErrors((x) => (x[key] ? { ...x, [key]: undefined } : x));
  const set = (key) => (e) => {
    setV((x) => ({ ...x, [key]: e.target.value }));
    clearError(key);
  };
  const choices = isAdmin ? packages : packages.filter((p) => p.active);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (v.title.trim().length < 2) next.title = t.errRequired;
    if (!isValidWhatsapp(v.whatsapp)) next.whatsapp = t.errPhoneBad;
    if (mode === 'new' && !v.packageId) next.package = t.errNeedPackage;
    if (!isAdmin && !file) next.file = t.errNeedFile;
    if (mode === 'admin-new' && !(Number.isInteger(+v.days) && +v.days >= 1 && +v.days <= 365)) next.days = t.errRequired;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError('');
    let uploaded = null;
    let uploadedThumb = null;
    try {
      let fileFields = {};
      if (file?.blob) {
        uploaded = await api.uploadFile(file.blob, user.id);
        if (file.thumbBlob) uploadedThumb = await api.uploadFile(file.thumbBlob, user.id, { thumb: true });
        fileFields = { fileUrl: uploaded.url, filePath: uploaded.path, fileType: file.fileType, thumbUrl: uploadedThumb?.url ?? '', thumbPath: uploadedThumb?.path ?? '' };
      } else if (file?.copy && file.filePath) {
        uploaded = await api.copyFile({ url: file.fileUrl, path: file.filePath }, user.id);
        if (file.thumbPath) uploadedThumb = await api.copyFile({ url: file.thumbUrl, path: file.thumbPath }, user.id);
        fileFields = { fileUrl: uploaded.url, filePath: uploaded.path, fileType: file.fileType, thumbUrl: uploadedThumb?.url ?? '', thumbPath: uploadedThumb?.path ?? '' };
      } else if (file) {
        fileFields = {
          fileUrl: file.fileUrl, filePath: file.copy ? null : file.filePath ?? null, fileType: file.fileType,
          thumbUrl: file.copy ? '' : file.thumbUrl || '', thumbPath: file.copy ? null : file.thumbPath ?? null,
        };
      }
      const base = {
        title: v.title, company: v.company, country: v.country, city: v.city, category: v.category, whatsapp: v.whatsapp, details: v.details, ...fileFields,
      };
      let saved;
      if (mode === 'new') saved = await api.createJob({ ...base, packageId: v.packageId });
      else if (mode === 'edit') {
        saved = await api.updateJob(job.id, base);
        if (job.status === 'rejected') saved = await api.resubmitJob(job.id); // a fixed, rejected ad goes back to review
      } else if (mode === 'admin-new') saved = await api.adminCreateJob({ ...base, packageId: v.packageId || null }, Number(v.days));
      else saved = await api.adminUpdateJob(job.id, { ...base, packageId: v.packageId || null, expiresAt: v.expires ? endOfDay(v.expires) : undefined });
      if (isEdit && uploaded) {
        if (job.filePath) api.removeFile(job.filePath).catch(() => {});
        if (job.thumbPath) api.removeFile(job.thumbPath).catch(() => {});
      }
      onSaved(saved);
    } catch (err) {
      if (uploaded) api.removeFile(uploaded.path).catch(() => {});
      if (uploadedThumb) api.removeFile(uploadedThumb.path).catch(() => {});
      setFormError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  const submitLabel = { new: t.continuePay, edit: job?.status === 'rejected' ? t.saveAndResend : t.saveChanges, 'admin-new': t.save, 'admin-edit': t.saveChanges }[mode];

  return (
    <form className="form" onSubmit={submit} noValidate>
      {renewFrom && <Notice tone="info">{t.renewNote}</Notice>}

      <Field label={t.fTitle} help={t.fTitleHelp} error={errors.title}>
        <input type="text" value={v.title} onChange={set('title')} maxLength={120} />
      </Field>
      <Field label={t.fCompany}>
        <input type="text" value={v.company} onChange={set('company')} maxLength={120} />
      </Field>
      <div className="field-row">
        <Field label={t.fCountry}>
          <select value={v.country} onChange={set('country')}>
            {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.flag} {t.country[c.id]}</option>)}
          </select>
        </Field>
        <Field label={t.fCity}>
          <input type="text" value={v.city} onChange={set('city')} maxLength={80} />
        </Field>
      </div>
      <Field label={t.fCategory}>
        <select value={v.category} onChange={set('category')}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t.category[c.id]}</option>)}
        </select>
      </Field>
      <Field label={t.fWhatsapp} help={t.fWhatsappHelp} error={errors.whatsapp}>
        <input type="tel" inputMode="numeric" value={v.whatsapp} onChange={set('whatsapp')} maxLength={20} />
      </Field>

      <Field label={t.fDetails} help={t.fDetailsHelp}>
        <textarea rows={4} value={v.details} onChange={set('details')} maxLength={600} />
      </Field>

      <FileField value={file} onChange={(f) => { setFile(f); clearError('file'); }} error={errors.file} />

      {mode === 'new' && <PackagePicker packages={choices} value={v.packageId} onChange={(id) => { setV((x) => ({ ...x, packageId: id })); clearError('package'); }} error={errors.package} />}
      {isEdit && !isAdmin && job.package && (
        <p className="help">{t.package}: <strong>{job.package.name}</strong> ({formatPrice(job.package.pricePaise)}, {t.pkgDays(job.package.durationDays)})</p>
      )}
      {isAdmin && (
        <>
          <Field label={t.package}>
            <select value={v.packageId} onChange={set('packageId')}>
              <option value="">{t.noPackageOption}</option>
              {choices.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPrice(p.pricePaise)}, {t.pkgDays(p.durationDays)})</option>)}
            </select>
          </Field>
          {mode === 'admin-new' && (
            <Field label={t.adminDays} error={errors.days}>
              <input type="number" inputMode="numeric" min="1" max="365" value={v.days} onChange={set('days')} />
            </Field>
          )}
          {mode === 'admin-edit' && job.expiresAt && (
            <Field label={t.adminExpires}>
              <input type="date" value={v.expires} onChange={set('expires')} />
            </Field>
          )}
        </>
      )}

      <Notice tone="error">{formError}</Notice>
      <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : submitLabel}</Button>
    </form>
  );
}
