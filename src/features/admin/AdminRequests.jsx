// /admin/requests - change requests from employers: open the ad to edit it, WhatsApp the employer, mark done or decline.
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { candidateWhatsApp, formatDate, whatsappLink } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';
import { withParam } from '../../shared/lib/urlParams';

/** Change requests for the admin. Shows the waiting ones first by default. */
export default function AdminRequests() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const list = useAsync(() => api.adminListChangeRequests(), []);
  const { notice, success, fail } = useNotice();
  const status = params.get('status') || 'open';

  const set = async (id, next) => {
    try {
      await api.adminSetChangeRequest(id, next);
      success(t.requestUpdated);
      list.reload();
    } catch (err) {
      fail(err);
    }
  };

  const rows = (list.data || []).filter((r) => status === 'all' || r.status === status);
  return (
    <section className="section">
      <div className="toolbar">
        <Field label={t.colStatus}>
          <select value={status} onChange={(e) => setParams((prev) => withParam(prev, 'status', e.target.value, 'open'), { replace: true })}>
            <option value="all">{t.all}</option>
            {Object.entries(t.requestStatus).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
      </div>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={list} isEmpty={() => false}>
        {() => (rows.length === 0 ? (
          <p className="state-text center">{t.requestsNone}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.colDate}</th><th>{t.colEmployer}</th><th>{t.colAd}</th><th>{t.colMessage}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label={t.colDate}>{formatDate(r.createdAt, lang)}</td>
                    <td data-label={t.colEmployer}>{r.employerName || '-'}</td>
                    <td data-label={t.colAd}>{r.jobTitle || '-'}</td>
                    <td data-label={t.colMessage}>{r.message}</td>
                    <td data-label={t.colStatus}>{t.requestStatus[r.status]}</td>
                    <td data-label={t.colActions}>
                      <div className="row-actions">
                        <Button size="sm" tone="outline" icon="edit" to={`/admin/jobs/${r.jobId}`}>{t.requestOpenAd}</Button>
                        <Button size="sm" icon="whatsapp" href={whatsappLink(candidateWhatsApp(r.employerPhone), t.waToEmployer(r.jobTitle))} target="_blank" rel="noopener noreferrer">{t.whatsappThem}</Button>
                        {r.status === 'open' && <Button size="sm" tone="green" icon="check" onClick={() => set(r.id, 'done')}>{t.requestMarkDone}</Button>}
                        {r.status === 'open' && <Button size="sm" tone="outline" icon="close" onClick={() => set(r.id, 'declined')}>{t.requestDecline}</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </AsyncView>
    </section>
  );
}
