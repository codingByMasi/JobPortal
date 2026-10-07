// /admin/employers - verify or block employers, and look at their ads and payments.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';

/** The ads and payments of one employer, in a pop-up. */
function EmployerDetails({ employer, onClose }) {
  const { t, lang } = useLang();
  const data = useAsync(async () => {
    const [jobs, payments] = await Promise.all([api.adminListJobs(), api.adminListPayments()]);
    return { jobs: jobs.filter((j) => j.recruiterId === employer.id), payments: payments.filter((p) => p.recruiterId === employer.id) };
  }, [employer.id]);
  return (
    <Modal title={employer.companyName || employer.email} onClose={onClose} wide>
      <AsyncView state={data} isEmpty={() => false}>
        {({ jobs, payments }) => (
          <>
            <h3>{t.adsOf(employer.companyName)}</h3>
            {jobs.length === 0 ? <p className="muted">{t.employerNone}</p> : (
              <ul className="mini-list">
                {jobs.map((j) => <li key={j.id}><span>{j.title}</span><StatusBadge job={j} /></li>)}
              </ul>
            )}
            <h3>{t.paymentsOf(employer.companyName)}</h3>
            {payments.length === 0 ? <p className="muted">{t.employerNone}</p> : (
              <ul className="mini-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    <span>{formatDate(p.createdAt, lang)} · {p.jobTitle || '-'}</span>
                    <span>{formatPrice(p.amountPaise)} · {t.payStatus[p.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </AsyncView>
    </Modal>
  );
}

/** Employers list. */
export default function AdminEmployers() {
  const { t, lang } = useLang();
  const list = useAsync(() => api.adminListRecruiters(), []);
  const { notice, success, fail } = useNotice();
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);

  const change = async (employer, patch) => {
    setBusy(true);
    try {
      await api.adminSetRecruiter(employer.id, patch);
      success(t.employerSaved);
      list.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={list} empty={t.noEmployers} emptyIcon="users">
        {(rows) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.companyName}</th><th>{t.email}</th><th>{t.phone}</th><th>{t.raShort}</th><th>{t.colDate}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td data-label={t.companyName}><strong>{e.companyName || '-'}</strong>{e.role === 'admin' && <span className="muted"> ({t.adminPanel})</span>}</td>
                    <td data-label={t.email}>{e.email}</td>
                    <td data-label={t.phone}>{e.phone || '-'}</td>
                    <td data-label={t.raShort}>{e.raNumber || '-'}</td>
                    <td data-label={t.colDate}>{formatDate(e.createdAt, lang)}</td>
                    <td data-label={t.colStatus}>
                      {e.verified && <span className="tag tag-verified"><Icon name="badge" size={16} />{t.verifiedTag}</span>}
                      {e.blocked && <span className="tag tag-blocked"><Icon name="ban" size={16} />{t.blockedTag}</span>}
                    </td>
                    <td data-label={t.colActions}>
                      <div className="row-actions">
                        <Button size="sm" tone="outline" icon="badge" disabled={busy} onClick={() => change(e, { verified: !e.verified })}>
                          {e.verified ? t.unverify : t.verify}
                        </Button>
                        <Button size="sm" tone={e.blocked ? 'green' : 'danger'} icon="ban" disabled={busy || e.role === 'admin'} onClick={() => change(e, { blocked: !e.blocked })}>
                          {e.blocked ? t.unblock : t.block}
                        </Button>
                        <Button size="sm" tone="outline" icon="list" onClick={() => setDetails(e)}>{t.employerAdsPayments}</Button>
                        {e.role !== 'admin' && <Button size="sm" tone="outline" icon="badge" to={`/admin/offers?employer=${e.id}`}>{t.giveOffer}</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
      {details && <EmployerDetails employer={details} onClose={() => setDetails(null)} />}
    </section>
  );
}
