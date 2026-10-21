// /admin/activity - what the admins did (approvals, rejections, extra days, payments, settings), newest first, with a filter for one kind of action.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { adReference } from '../../shared/lib/adReference';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** The admin log as a table. */
export default function AdminActivity() {
  const { t, lang } = useLang();
  const [action, setAction] = useState('');
  const rows = useAsync(() => api.adminListActivity({ action }), [action]);
  return (
    <section className="section">
      <p className="help">{t.activityHelp}</p>
      <div className="toolbar">
        <Field label={t.activityWhat}>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t.auditAll}</option>
            {Object.entries(t.activityActions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
      </div>
      <AsyncView state={rows} empty={t.activityNone} emptyIcon="list">
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.colDate}</th><th>{t.activityBy}</th><th>{t.activityWhat}</th><th>{t.activityAd}</th><th>{t.colMessage}</th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td data-label={t.colDate}>{formatDate(a.createdAt, lang)}</td>
                    <td data-label={t.activityBy}>{a.adminName || '-'}</td>
                    <td data-label={t.activityWhat}>{t.activityActions[a.action] || a.action}</td>
                    <td data-label={t.activityAd}>
                      {a.targetId ? <Button size="sm" tone="outline" icon="search" to={`/admin/jobs?q=${adReference(a.targetId)}`}>{adReference(a.targetId)}</Button> : '-'}
                    </td>
                    <td data-label={t.colMessage}>{a.detail || '-'}</td>
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
