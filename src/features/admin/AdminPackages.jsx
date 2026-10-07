// /admin/packages - plans: order them, change price and days, badge, featured, turn on or off, delete a plan that has no ads.
import { useState } from 'react';
import AdminPackageForm from './AdminPackageForm';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';

/** Plans list for the admin. */
export default function AdminPackages() {
  const { t } = useLang();
  const data = useAsync(async () => {
    const [packages, usage] = await Promise.all([api.listPackages(), api.adminPackageUsage()]);
    return { packages, usage };
  }, []);
  const { notice, success, fail } = useNotice();
  const [editing, setEditing] = useState(null); // null = closed, {} = new, plan = edit
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (work, doneText) => {
    setBusy(true);
    try {
      await work();
      if (doneText) success(doneText);
      data.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const move = (rows, index, step) => {
    const ids = rows.map((p) => p.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    run(() => api.adminReorderPackages(ids));
  };

  return (
    <section className="section">
      <div className="toolbar">
        <Button icon="plus" onClick={() => setEditing({})}>{t.addPackage}</Button>
      </div>
      <p className="help">{t.pkgPriceWarn}</p>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={data} isEmpty={(d) => d.packages.length === 0} empty={t.noPackages} emptyIcon="box">
        {({ packages: rows, usage }) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.pkgOrder}</th><th>{t.pkgName}</th><th>{t.pkgPriceLabel}</th><th>{t.pkgDuration}</th><th>{t.tagFeatured}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id} className={p.active ? '' : 'row-off'}>
                    <td data-label={t.pkgOrder}>
                      <div className="row-actions">
                        <Button size="sm" tone="outline" disabled={busy || i === 0} aria-label={`${t.moveUp}: ${p.name}`} onClick={() => move(rows, i, -1)}>▲</Button>
                        <Button size="sm" tone="outline" disabled={busy || i === rows.length - 1} aria-label={`${t.moveDown}: ${p.name}`} onClick={() => move(rows, i, 1)}>▼</Button>
                      </div>
                    </td>
                    <td data-label={t.pkgName}>
                      <strong>{p.name}</strong>
                      {p.badgeText && <span className="tag"> {p.badgeText}</span>}
                      {p.description && <span className="muted"><br />{p.description}</span>}
                    </td>
                    <td data-label={t.pkgPriceLabel}>{formatPrice(p.pricePaise)}</td>
                    <td data-label={t.pkgDuration}>{p.durationDays}</td>
                    <td data-label={t.tagFeatured}>{p.featured ? <Icon name="star" size={20} className="inline-icon" /> : '-'}</td>
                    <td data-label={t.colStatus}>{p.active ? t.pkgActiveTag : t.pkgInactiveTag}</td>
                    <td data-label={t.colActions}>
                      <div className="row-actions">
                        <Button size="sm" tone="outline" icon="edit" onClick={() => setEditing(p)}>{t.edit}</Button>
                        <Button size="sm" tone={p.active ? 'outline' : 'green'} icon={p.active ? 'eyeoff' : 'eye'} disabled={busy} onClick={() => run(() => api.adminSavePackage({ ...p, active: !p.active }), t.packageSaved)}>
                          {p.active ? t.deactivate : t.activate}
                        </Button>
                        {usage[p.id] ? <span className="muted">{t.pkgHasAds(usage[p.id])}</span> : <Button size="sm" tone="danger" icon="trash" disabled={busy} onClick={() => setDeleting(p)}>{t.delete}</Button>}
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
        <AdminPackageForm
          pkg={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            success(t.packageSaved);
            data.reload();
          }}
        />
      )}
      {deleting && (
        <Modal title={t.deletePlanTitle(deleting.name)} onClose={() => setDeleting(null)}>
          <p>{t.deletePlanText}</p>
          <div className="actions">
            <Button tone="danger" icon="trash" disabled={busy} onClick={async () => { const p = deleting; setDeleting(null); await run(() => api.adminDeletePackage(p.id), t.planDeleted); }}>{t.delete}</Button>
            <Button tone="outline" onClick={() => setDeleting(null)}>{t.cancel}</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
