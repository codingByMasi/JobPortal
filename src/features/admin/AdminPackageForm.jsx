// The add / edit form of one plan (package), in a pop-up.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { paiseToRupees, rupeesToPaise } from '../../shared/lib/money';

/** `pkg` is null for a new plan. `onSaved` runs after saving. */
export default function AdminPackageForm({ pkg, onClose, onSaved }) {
  const { t } = useLang();
  const [v, setV] = useState({
    name: pkg?.name || '',
    price: pkg ? paiseToRupees(pkg.pricePaise) : '',
    days: pkg ? String(pkg.durationDays) : '30',
    description: pkg?.description || '',
    badge: pkg?.badgeText || '',
    maxFiles: pkg ? String(pkg.maxFiles) : '1',
    featured: pkg?.featured || false,
    active: pkg ? pkg.active : true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setV({ ...v, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const pricePaise = rupeesToPaise(v.price);
    const days = Number(v.days);
    const files = Number(v.maxFiles);
    const next = {};
    if (!v.name.trim()) next.name = t.errRequired;
    if (pricePaise === null) next.price = t.errPrice;
    if (!Number.isInteger(days) || days < 1 || days > 365) next.days = t.errRequired;
    if (!Number.isInteger(files) || files < 1 || files > 10) next.maxFiles = t.errRequired;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.adminSavePackage({
        id: pkg?.id, name: v.name, pricePaise, durationDays: days, description: v.description, badgeText: v.badge, maxFiles: files, featured: v.featured, active: v.active,
      });
      onSaved();
    } catch (err) {
      setFormError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <Modal title={t.packageTitle} onClose={onClose}>
      <form className="form" onSubmit={save} noValidate>
        <Field label={t.pkgName} help={t.pkgNameHelp} error={errors.name}>
          <input type="text" value={v.name} onChange={set('name')} maxLength={60} />
        </Field>
        <Field label={t.pkgPriceLabel} error={errors.price}>
          <input type="text" inputMode="decimal" value={v.price} onChange={set('price')} />
        </Field>
        {pkg && <Notice tone="info">{t.pkgPriceWarn}</Notice>}
        <Field label={t.pkgDuration} error={errors.days}>
          <input type="number" inputMode="numeric" min="1" max="365" value={v.days} onChange={set('days')} />
        </Field>
        <Field label={t.pkgDescription} help={t.pkgDescriptionHelp}>
          <input type="text" value={v.description} onChange={set('description')} maxLength={200} />
        </Field>
        <Field label={t.pkgBadge} help={t.pkgBadgeHelp}>
          <input type="text" value={v.badge} onChange={set('badge')} maxLength={30} />
        </Field>
        <Field label={t.pkgMaxFiles} help={t.pkgMaxFilesHelp} error={errors.maxFiles}>
          <input type="number" inputMode="numeric" min="1" max="10" value={v.maxFiles} onChange={set('maxFiles')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={v.featured} onChange={(e) => setV({ ...v, featured: e.target.checked })} />
          <span>{t.pkgFeaturedLabel}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          <span>{t.pkgActiveLabel}</span>
        </label>
        <Notice tone="error">{formError}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
      </form>
    </Modal>
  );
}
