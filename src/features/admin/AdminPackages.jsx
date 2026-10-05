// /admin/packages - add a package, change its price and days, turn it on or off.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice, paiseToRupees, rupeesToPaise } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';

/** Add / edit form for one package, in a pop-up. */
function PackageForm({ pkg, onClose, onSaved }) {
  const { t } = useLang();
  const [v, setV] = useState({
    name: pkg?.name || '',
    price: pkg ? paiseToRupees(pkg.pricePaise) : '',
    days: pkg ? String(pkg.durationDays) : '30',
    featured: pkg?.featured || false,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const pricePaise = rupeesToPaise(v.price);
    const days = Number(v.days);
    const next = {};
    if (!v.name.trim()) next.name = t.errRequired;
    if (pricePaise === null) next.price = t.errPrice;
    if (!Number.isInteger(days) || days < 1 || days > 365) next.days = t.errRequired;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.adminSavePackage({ id: pkg?.id, name: v.name, pricePaise, durationDays: days, featured: v.featured, active: pkg ? pkg.active : true });
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
          <input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} />
        </Field>
        <Field label={t.pkgPriceLabel} error={errors.price}>
          <input type="text" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        </Field>
        <Field label={t.pkgDuration} error={errors.days}>
          <input type="number" inputMode="numeric" min="1" max="365" value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={v.featured} onChange={(e) => setV({ ...v, featured: e.target.checked })} />
          <span>{t.pkgFeaturedLabel}</span>
        </label>
        <Notice tone="error">{formError}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
      </form>
    </Modal>
  );
}

/** Packages list for the admin. */
export default function AdminPackages() {
  const { t } = useLang();
  const packages = useAsync(() => api.listPackages(), []);
  const { notice, success, fail } = useNotice();
  const [editing, setEditing] = useState(null); // null = closed, {} = new, package = edit
  const [busy, setBusy] = useState(false);

  const toggleActive = async (pkg) => {
    setBusy(true);
    try {
      await api.adminSavePackage({ ...pkg, active: !pkg.active });
      success(t.packageSaved);
      packages.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="toolbar">
        <Button icon="plus" onClick={() => setEditing({})}>{t.addPackage}</Button>
      </div>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={packages} empty={t.noAdsFound} emptyIcon="box">
        {(rows) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.pkgName}</th><th>{t.pkgPriceLabel}</th><th>{t.pkgDuration}</th><th>{t.tagFeatured}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'row-off'}>
                    <td data-label={t.pkgName}><strong>{p.name}</strong></td>
                    <td data-label={t.pkgPriceLabel}>{formatPrice(p.pricePaise)}</td>
                    <td data-label={t.pkgDuration}>{p.durationDays}</td>
                    <td data-label={t.tagFeatured}>{p.featured ? <Icon name="star" size={20} className="inline-icon" /> : '-'}</td>
                    <td data-label={t.colStatus}>{p.active ? t.pkgActiveTag : t.pkgInactiveTag}</td>
                    <td data-label={t.colActions}>
                      <div className="row-actions">
                        <Button size="sm" tone="outline" icon="edit" onClick={() => setEditing(p)}>{t.edit}</Button>
                        <Button size="sm" tone={p.active ? 'outline' : 'green'} icon={p.active ? 'eyeoff' : 'eye'} disabled={busy} onClick={() => toggleActive(p)}>
                          {p.active ? t.deactivate : t.activate}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
      {editing && (
        <PackageForm
          pkg={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            success(t.packageSaved);
            packages.reload();
          }}
        />
      )}
    </section>
  );
}
