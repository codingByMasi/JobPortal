// /admin/reports - reports about ads and account deletion requests: read, mark done or dismiss. Nothing is deleted from here.
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { adReference } from '../../shared/lib/adReference';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';
import { reportsOpenPerAd } from '../../shared/lib/reports';
import { withParam } from '../../shared/lib/urlParams';

/** Reports and deletion requests for the admin. Waiting ones show first. */
export default function AdminReports() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const data = useAsync(async () => {
    const [reports, deletions] = await Promise.all([api.adminListReports(), api.adminListDeletionRequests()]);
    return { reports, deletions };
  }, []);
  const { notice, success, fail } = useNotice();
  const status = params.get('status') || 'open';

  const set = async (work) => {
    try {
      await work();
      success(t.reportUpdated);
      data.reload();
    } catch (err) {
      fail(err);
    }
  };
  const show = (rows) => rows.filter((r) => status === 'all' || r.status === status);
  const openPerAd = reportsOpenPerAd(data.data?.reports || []);
  const hideAndClose = (r) => set(async () => {
    await api.adminSetHidden(r.jobId, true);
    await api.adminSetReport(r.id, 'done');
  });
  const buttons = (r, setter) => r.status === 'open' && (
    <div className="row-actions">
      <Button size="sm" tone="green" icon="check" onClick={() => set(() => setter(r.id, 'done'))}>{t.reportMarkDone}</Button>
      <Button size="sm" tone="outline" icon="close" onClick={() => set(() => setter(r.id, 'dismissed'))}>{t.reportDismiss}</Button>
    </div>
  );

  return (
    <section className="section">
      <div className="toolbar">
        <Field label={t.colStatus}>
          <select value={status} onChange={(e) => setParams((prev) => withParam(prev, 'status', e.target.value, 'open'), { replace: true })}>
            <option value="all">{t.all}</option>
            {Object.entries(t.reportStatus).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
      </div>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={data} isEmpty={() => false}>
        {({ reports, deletions }) => (
          <>
            <h2>{t.reportsTitle}</h2>
            {show(reports).length === 0 ? <p className="state-text center">{t.reportsNone}</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t.colDate}</th><th>{t.colAd}</th><th>{t.colReason}</th><th>{t.colMessage}</th><th>{t.colContact}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr></thead>
                  <tbody>
                    {show(reports).map((r) => (
                      <tr key={r.id}>
                        <td data-label={t.colDate}>{formatDate(r.createdAt, lang)}</td>
                        <td data-label={t.colAd}>{r.jobTitle || '-'}<br /><span className="muted">{r.employerName}</span>{r.status === 'open' && openPerAd[r.jobId] > 1 && <><br /><strong>{t.reportsOnAd(openPerAd[r.jobId])}</strong></>}</td>
                        <td data-label={t.colReason}>{t.reportReasons[r.reason]}</td>
                        <td data-label={t.colMessage}>{r.message || '-'}</td>
                        <td data-label={t.colContact}>{r.contact || '-'}</td>
                        <td data-label={t.colStatus}>{t.reportStatus[r.status]}</td>
                        <td data-label={t.colActions}>
                          <div className="row-actions">
                            <Button size="sm" tone="outline" icon="search" to={`/admin/jobs?q=${adReference(r.jobId)}`}>{t.reportOpenAd}</Button>
                          </div>
                          {r.status === 'open' && r.jobStatus === 'live' && (
                            <div className="row-actions">
                              <Button size="sm" tone="danger" icon="eyeoff" onClick={() => hideAndClose(r)}>{t.reportHideAd}</Button>
                            </div>
                          )}
                          {buttons(r, api.adminSetReport)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h2>{t.deletionTitle}</h2>
            <p className="help">{t.deletionHelp}</p>
            {show(deletions).length === 0 ? <p className="state-text center">{t.deletionNone}</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t.colDate}</th><th>{t.email}</th><th>{t.colMessage}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr></thead>
                  <tbody>
                    {show(deletions).map((r) => (
                      <tr key={r.id}>
                        <td data-label={t.colDate}>{formatDate(r.createdAt, lang)}</td>
                        <td data-label={t.email}>{r.email}</td>
                        <td data-label={t.colMessage}>{r.note || '-'}</td>
                        <td data-label={t.colStatus}>{t.reportStatus[r.status]}</td>
                        <td data-label={t.colActions}>{buttons(r, api.adminSetDeletionRequest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </AsyncView>
    </section>
  );
}
