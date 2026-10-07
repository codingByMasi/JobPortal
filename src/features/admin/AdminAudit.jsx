// /admin/history - who changed which plan or offer, when, from what to what. Can be filtered.
import { useState } from 'react';
import Field from '../../shared/ui/Field';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { changedFields, showValue } from './auditText';

const dayStart = (s) => (s ? new Date(`${s}T00:00:00`).getTime() : null);
const dayAfter = (s) => (s ? new Date(`${s}T00:00:00`).getTime() + 86400000 : null);

/** Change history of plans and offers. */
export default function AdminAudit() {
  const { t, lang } = useLang();
  const [f, setF] = useState({ table: '', action: '', from: '', to: '' });
  const rows = useAsync(() => api.adminListAudit({ table: f.table, action: f.action, from: dayStart(f.from), to: dayAfter(f.to) }), [f.table, f.action, f.from, f.to]);
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  return (
    <section className="section">
      <p className="help">{t.auditHelp}</p>
      <div className="filter-row">
        <Field label={t.auditTable}>
          <select value={f.table} onChange={set('table')}>
            <option value="">{t.auditAll}</option>
            <option value="packages">{t.auditPackages}</option>
            <option value="offers">{t.auditOffers}</option>
          </select>
        </Field>
        <Field label={t.auditAction}>
          <select value={f.action} onChange={set('action')}>
            <option value="">{t.auditAll}</option>
            {['insert', 'update', 'delete'].map((a) => <option key={a} value={a}>{t.auditActions[a]}</option>)}
          </select>
        </Field>
        <Field label={t.auditFrom}><input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label={t.auditTo}><input type="date" value={f.to} onChange={set('to')} /></Field>
      </div>
      <AsyncView state={rows} empty={t.noAudit} emptyIcon="list">
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.colDate}</th><th>{t.auditBy}</th><th>{t.auditAction}</th><th>{t.auditTable}</th><th>{t.auditChanges}</th></tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td data-label={t.colDate}>{formatDate(a.createdAt, lang)}</td>
                    <td data-label={t.auditBy}>{a.adminName || '-'}</td>
                    <td data-label={t.auditAction}>{t.auditActions[a.action] || a.action}</td>
                    <td data-label={t.auditTable}>{a.tableName === 'packages' ? t.auditPackages : t.auditOffers}: <strong>{(a.newValue || a.oldValue)?.name || ''}</strong></td>
                    <td data-label={t.auditChanges}>
                      {changedFields(a.oldValue, a.newValue).map((c) => (
                        <div key={c.field}>{c.field}: {a.action === 'insert' ? '' : `${showValue(c.field, c.from, formatPrice)} → `}{showValue(c.field, c.to, formatPrice)}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
    </section>
  );
}
