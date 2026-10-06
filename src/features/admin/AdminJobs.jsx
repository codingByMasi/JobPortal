// /admin/jobs - every ad, with filters and the buttons to approve, reject, hide, mark paid, edit and delete.
import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Icon from '../../shared/ui/Icon';
import { AdFileDialog, DeleteDialog, PaidDialog, RejectDialog } from './AdminJobDialogs';
import Notice from '../../shared/ui/Notice';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { adReference } from '../../shared/lib/adReference';
import { candidateWhatsApp, describeStatus, whatsappLink } from '../../shared/lib/format';
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
    }
  };

  const act = (kind, job) => {
    if (kind === 'approve') run(() => api.adminApprove(job.id), t.adApproved);
    else if (kind === 'hide') run(() => api.adminSetHidden(job.id, true), t.adHidden);
    else if (kind === 'show') run(() => api.adminSetHidden(job.id, false), t.adShown);
    else setDialog({ kind: kind === 'markPaid' ? 'paid' : kind, job });
  };

  const all = ads.data || [];
  // hints that help the admin spot a risky ad: the first ad of an employer, and one WhatsApp number used by many ads
  const isFirstAd = (job) => !all.some((o) => o.id !== job.id && o.recruiterId === job.recruiterId && !['pending_payment', 'draft'].includes(o.status));
  const sameNumber = (job) => (job.whatsapp ? all.filter((o) => o.id !== job.id && o.whatsapp === job.whatsapp).length : 0);

  const rows = all.filter((j) => {
    if (status !== 'all' && effectiveStatus(j) !== status) return false;
    if (!q) return true;
    return [j.title, j.company, j.city, j.recruiter?.companyName, j.recruiter?.email, adReference(j.id)].join(' ').toLowerCase().includes(q);
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
                        {job.recruiter?.raNumber && <><br /><span className="muted">{t.raShort}: {job.recruiter.raNumber}</span></>}
                        {['pending_payment', 'paid_pending_review'].includes(job.status) && isFirstAd(job) && <p className="hint">{t.firstAd}</p>}
                        {sameNumber(job) > 0 && <p className="hint">{t.sameNumber(sameNumber(job))}</p>}
                      </td>
                      <td data-label={t.colPackage}>{job.package ? `${job.package.name} · ${formatPrice(job.priceAtOrder ?? job.package.pricePaise)}` : "-"}</td>
                      <td data-label={t.colStatus}>
                        <StatusBadge job={job} />
                        <br /><span className="muted">{describeStatus(job, t, lang)}</span>
                        <br /><span className="muted">{adReference(job.id)}</span>
                      </td>
                      <td data-label={t.colActions}>
                        <div className="row-actions">
                          {job.fileUrl && <Button size="sm" tone="blue" icon="eye" onClick={() => setDialog({ kind: 'view', job })}>{t.viewAd}</Button>}
                          {job.recruiter?.phone && (
                            <Button size="sm" tone="outline" icon="whatsapp" href={whatsappLink(candidateWhatsApp(job.recruiter.phone), t.waToEmployerAd(job.title, describeStatus(job, t, lang)))} target="_blank" rel="noopener noreferrer">{t.whatsappThem}</Button>
                          )}
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

      {dialog?.kind === 'view' && <AdFileDialog job={dialog.job} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reject' && (
        <RejectDialog job={dialog.job} busy={busy} onClose={() => setDialog(null)} onConfirm={(reason) => run(() => api.adminReject(dialog.job.id, reason), t.adRejected)} />
      )}
      {dialog?.kind === 'paid' && (
        <PaidDialog job={dialog.job} busy={busy} onClose={() => setDialog(null)} onConfirm={(reference) => run(() => api.adminMarkPaid(dialog.job.id, { reference }), t.adPaid)} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog job={dialog.job} busy={busy} onClose={() => setDialog(null)} onConfirm={() => run(() => api.deleteJob(dialog.job), t.adDeleted)} />
      )}
    </section>
  );
}
