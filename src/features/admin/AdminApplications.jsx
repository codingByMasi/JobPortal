// /admin/applications - everyone who applied, with search and a CSV download.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { downloadTextFile, toCsv } from '../../shared/lib/csv';
import { candidateWhatsApp, formatDate, whatsappLink } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** All applications for the admin. */
export default function AdminApplications() {
  const { t, lang } = useLang();
  const apps = useAsync(() => api.adminListApplications(), []);
  const [q, setQ] = useState('');

  const needle = q.trim().toLowerCase();
  const rows = (apps.data || []).filter((a) => !needle || [a.name, a.phone, a.city, a.jobTitle, a.company, a.message].join(' ').toLowerCase().includes(needle));

  const exportCsv = () => {
    const columns = [
      { key: 'date', label: t.colDate }, { key: 'jobTitle', label: t.colAd }, { key: 'company', label: t.fCompany },
      { key: 'name', label: t.colName }, { key: 'phone', label: t.colPhone }, { key: 'city', label: t.colCity }, { key: 'message', label: t.colMessage },
    ];
    const data = rows.map((a) => ({ ...a, date: new Date(a.createdAt).toISOString().slice(0, 10) }));
    downloadTextFile(`applications-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data, columns));
  };

  return (
    <section className="section">
      <div className="toolbar">
        <Field label={t.searchApps}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Button icon="download" tone="blue" onClick={exportCsv} disabled={rows.length === 0}>{t.exportCsv}</Button>
      </div>
      <AsyncView state={apps} empty={t.noApps} emptyIcon="users">
        {() =>
          rows.length === 0 ? (
            <p className="state-text center">{t.noAppsFound}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t.colDate}</th><th>{t.colAd}</th><th>{t.colName}</th><th>{t.colPhone}</th><th>{t.colCity}</th><th>{t.colMessage}</th><th>{t.colActions}</th></tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td data-label={t.colDate}>{formatDate(a.createdAt, lang)}</td>
                      <td data-label={t.colAd}>{a.jobTitle}<br /><span className="muted">{a.company}</span></td>
                      <td data-label={t.colName}>{a.name}</td>
                      <td data-label={t.colPhone}>{a.phone}</td>
                      <td data-label={t.colCity}>{a.city || '-'}</td>
                      <td data-label={t.colMessage}>{a.message || '-'}</td>
                      <td data-label={t.colActions}>
                        <Button size="sm" icon="whatsapp" href={whatsappLink(candidateWhatsApp(a.phone), t.waToCandidate(a.jobTitle))} target="_blank" rel="noopener noreferrer">
                          {t.whatsappThem}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </AsyncView>
    </section>
  );
}
