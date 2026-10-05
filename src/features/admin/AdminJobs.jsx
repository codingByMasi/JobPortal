// /admin/jobs - every ad, with filters and the buttons to approve, reject, hide, mark paid, edit and delete.
import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { describeStatus } from '../../shared/lib/format';
import { adminActions, effectiveStatus, STATUSES } from '../../shared/lib/jobStatus';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { withParam } from '../../shared/lib/urlParams';
import { useNotice } from '../../shared/lib/useNotice';

const BUTTONS = {
  approve: { icon: 'check', tone: 'green' },
  reject: { icon: 'close', tone: 'outline' },
  hide: { icon: 'eyeoff', tone: 'outline' },
  show: { icon: 'eye', tone: 'outline' },
  markPaid: { icon: 'rupee', tone: 'green' },
  edit: { icon: 'edit', tone: 'outline' },
  delete: { icon: 'trash', tone: 'danger' },
};

/** All ads for the admin. */
export default function AdminJobs() {
  const { t, lang } = useLang();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const ads = useAsync(() => api.adminListJobs(), []);
  const { notice, success, fail } = useNotice(location.state?.notice || '');
  const [dialog, setDialog] = useState(null); // { kind: 'reject' | 'paid' | 'delete', job }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const status = params.get('status') || 'all';
  const q = (params.get('q') || '').trim().toLowerCase();
  const setParam = (key, value) => setParams((prev) => withParam(prev, key, value, 'all'), { replace: true });

  const run = async (work, doneText) => {
    setBusy(true);
    try {
      await work();
      success(doneText);
      ads.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      setDialog(null);
      setReason('');
    }
  };

  const act = (kind, job) => {
    if (kind === 'approve') run(() => api.adminApprove(job.id), t.adApproved);
    else if (kind === 'hide') run(() => api.adminSetHidden(job.id, true), t.adHidden);
    else if (kind === 'show') run(() => api.adminSetHidden(job.id, false), t.adShown);
    else setDialog({ kind: kind === 'markPaid' ? 'paid' : kind, job });
  };

  const rows = (ads.data || []).filter((j) => {
    if (status !== 'all' && effectiveStatus(j) !== status) return false;
    if (!q) return true;
    return [j.title, j.company, j.city, j.recruiter?.companyName, j.recruiter?.email].join(' ').toLowerCase().includes(q);
  });

  return (
    <section className="section">
      <div className="toolbar">
        <Field label={t.searchAds}>
          <input type="search" value={params.get('q') || ''} onChange={(e) => setParam('q', e.target.value)} />
        </Field>
        <Field label={t.statusFilter}>
          <select value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="all">{t.all}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t.statusShort[s]}</option>)}
          </select>
        </Field>
        <Button to="/admin/jobs/new" icon="plus">{t.addAd}</Button>
      </div>

      <Notice tone={notice.tone}>{notice.text}</Notice>

      <AsyncView state={ads} isEmpty={() => false}>
        {() =>
          rows.length === 0 ? (
            <p className="state-text center">{t.noAdsFound}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t.colAd}</th><th>{t.colEmployer}</th><th>{t.colPackage}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
                </thead>
                <tbody>
                  {rows.map((job) => (
                    <tr key={job.id}>
                      <td data-label={t.colAd}>
                        <strong>{job.title}</strong>
                        <br /><span className="muted">{[job.company, job.city, t.country[job.country]].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td data-label={t.colEmployer}>
                        {job.recruiter?.companyName || '-'}
                        {job.recruiter?.verified && <Icon name="badge" size={16} className="inline-icon" />}
                        <br /><span className="muted">{job.recruiter?.email}</span>
                      </td>
                      <td data-label={t.colPackage}>{job.package ? `${job.package.name} · ${formatPrice(job.package.pricePaise)}` : '-'}</td>
                      <td data-label={t.colStatus}>
                        <StatusBadge job={job} />
                        <br /><span className="muted">{describeStatus(job, t, lang)}</span>
                      </td>
                      <td data-label={t.colActions}>
                        <div className="row-actions">
                          {adminActions(job).map((kind) =>
                            kind === 'edit' ? (
                              <Button key={kind} size="sm" tone="outline" icon="edit" to={`/admin/jobs/${job.id}`}>{t.edit}</Button>
                            ) : (
                              <Button key={kind} size="sm" tone={BUTTONS[kind].tone} icon={BUTTONS[kind].icon} onClick={() => act(kind, job)} disabled={busy}>
                                {t[kind]}
                              </Button>
                            ),
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </AsyncView>

      {dialog?.kind === 'reject' && (
        <Modal title={t.rejectTitle} onClose={() => setDialog(null)}>
          <p className="modal-text"><strong>{dialog.job.title}</strong></p>
          <Field label={t.rejectReason}>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
          <Button tone="danger" icon="close" disabled={busy || !reason.trim()} onClick={() => run(() => api.adminReject(dialog.job.id, reason), t.adRejected)}>
            {t.rejectConfirm}
          </Button>
        </Modal>
      )}
      {dialog?.kind === 'paid' && (
        <Modal title={t.markPaidTitle} onClose={() => setDialog(null)}>
          <p className="modal-text"><strong>{dialog.job.title}</strong></p>
          <p className="modal-text">{t.markPaidText(formatPrice(dialog.job.package?.pricePaise ?? 0))}</p>
          <Button icon="rupee" disabled={busy} onClick={() => run(() => api.adminMarkPaid(dialog.job.id), t.adPaid)}>{t.markPaid}</Button>
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <Modal title={t.deleteAsk} onClose={() => setDialog(null)}>
          <p className="modal-text"><strong>{dialog.job.title}</strong></p>
          <p className="modal-text">{t.deleteText}</p>
          <Button tone="danger" icon="trash" disabled={busy} onClick={() => run(() => api.deleteJob(dialog.job), t.adDeleted)}>{t.yesDelete}</Button>
        </Modal>
      )}
    </section>
  );
}
