// /admin/payments - all payments with filters, add a manual payment, mark refunded.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { downloadTextFile, toCsv } from '../../shared/lib/csv';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice, rupeesToPaise } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { withParam } from '../../shared/lib/urlParams';
import { useNotice } from '../../shared/lib/useNotice';

/** The "add a payment" form in a pop-up. */
function AddPayment({ onClose, onSaved }) {
  const { t } = useLang();
  const data = useAsync(async () => {
    const [employers, jobs] = await Promise.all([api.adminListRecruiters(), api.adminListJobs()]);
    return { employers, jobs };
  }, []);
  const [v, setV] = useState({ recruiterId: '', jobId: '', amount: '', note: '', reference: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { fail } = useNotice();

  const save = async (e) => {
    e.preventDefault();
    const amountPaise = rupeesToPaise(v.amount);
    if (!v.recruiterId) return setError(t.errRequired);
    if (amountPaise === null) return setError(t.errPrice);
    setError('');
    setBusy(true);
    try {
      await api.adminAddPayment({ recruiterId: v.recruiterId, jobId: v.jobId || null, amountPaise, note: v.note.trim(), reference: v.reference.trim() });
      onSaved();
    } catch (err) {
      fail(err);
      setError(t.errGeneric);
      setBusy(false);
    }
  };

  return (
    <Modal title={t.addPaymentTitle} onClose={onClose}>
      <AsyncView state={data} isEmpty={() => false}>
        {({ employers, jobs }) => (
          <form className="form" onSubmit={save} noValidate>
            <Field label={t.colEmployer}>
              <select value={v.recruiterId} onChange={(e) => setV({ ...v, recruiterId: e.target.value, jobId: '' })}>
                <option value="" />
                {employers.map((e) => <option key={e.id} value={e.id}>{e.companyName || e.email}</option>)}
              </select>
            </Field>
            <Field label={t.adOptional}>
              <select value={v.jobId} onChange={(e) => setV({ ...v, jobId: e.target.value })}>
                <option value="">{t.noAdOption}</option>
                {jobs.filter((j) => j.recruiterId === v.recruiterId).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
            <Field label={t.amountRupees}>
              <input type="text" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label={t.payReferenceLabel} help={t.payReferenceHelp}>
              <input type="text" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} maxLength={60} />
            </Field>
            <Field label={t.note}>
              <input type="text" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={200} />
            </Field>
            <Notice tone="error">{error}</Notice>
            <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
          </form>
        )}
      </AsyncView>
    </Modal>
  );
}

/** Payments list for the admin. */
export default function AdminPayments() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const payments = useAsync(() => api.adminListPayments(), []);
  const { notice, success, fail } = useNotice();
  const [adding, setAdding] = useState(false);
  const [toRefund, setToRefund] = useState(null);
  const [hideAd, setHideAd] = useState(false);
  const [busy, setBusy] = useState(false);

  const status = params.get('status') || 'all';
  const method = params.get('method') || 'all';
  const setParam = (key, value) => setParams((prev) => withParam(prev, key, value, 'all'), { replace: true });

  const refund = async () => {
    setBusy(true);
    try {
      await api.adminRefund(toRefund.id, { hideAd });
      success(t.paymentRefunded);
      payments.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      setToRefund(null);
      setHideAd(false);
    }
  };

  const exportCsv = () => {
    const columns = [
      { key: 'date', label: t.colDate }, { key: 'recruiterName', label: t.colEmployer }, { key: 'jobTitle', label: t.colAd },
      { key: 'rupees', label: t.colAmount }, { key: 'status', label: t.colStatus }, { key: 'reference', label: t.payReferenceLabel }, { key: 'note', label: t.colNote },
    ];
    const data = rows.map((x) => ({ ...x, date: new Date(x.createdAt).toISOString().slice(0, 10), rupees: x.amountPaise / 100 }));
    downloadTextFile(`payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data, columns));
  };

  const rows = (payments.data || []).filter((p) => (status === 'all' || p.status === status) && (method === 'all' || p.method === method));
  const total = rows.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountPaise, 0);

  return (
    <section className="section">
      <div className="toolbar">
        <Field label={t.colStatus}>
          <select value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="all">{t.all}</option>
            {Object.entries(t.payStatus).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        <Field label={t.colHow}>
          <select value={method} onChange={(e) => setParam('method', e.target.value)}>
            <option value="all">{t.allMethods}</option>
            <option value="manual">{t.methodManual}</option>
          </select>
        </Field>
        <Button icon="plus" onClick={() => setAdding(true)}>{t.addPayment}</Button>
        <Button tone="outline" icon="download" onClick={exportCsv}>{t.exportCsv}</Button>
      </div>
      <Notice tone={notice.tone}>{notice.text}</Notice>

      <AsyncView state={payments} empty={t.payNone} emptyIcon="card">
        {() =>
          rows.length === 0 ? (
            <p className="state-text center">{t.payNoneFound}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t.colDate}</th><th>{t.colEmployer}</th><th>{t.colAd}</th><th>{t.colAmount}</th><th>{t.colHow}</th><th>{t.colStatus}</th><th>{t.colNote}</th><th>{t.colActions}</th></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td data-label={t.colDate}>{formatDate(p.createdAt, lang)}</td>
                      <td data-label={t.colEmployer}>{p.recruiterName || '-'}</td>
                      <td data-label={t.colAd}>{p.jobTitle || '-'}</td>
                      <td data-label={t.colAmount}>{formatPrice(p.amountPaise)}</td>
                      <td data-label={t.colHow}>{p.method === 'razorpay' ? t.methodRazorpay : t.methodManual}</td>
                      <td data-label={t.colStatus}><span className={`badge badge-pay-${p.status}`}>{t.payStatus[p.status]}</span></td>
                      <td data-label={t.colNote}>{[p.reference, p.note].filter(Boolean).join(' · ') || '-'}</td>
                      <td data-label={t.colActions}>
                        {p.status === 'paid' && <Button size="sm" tone="outline" icon="refresh" onClick={() => setToRefund(p)}>{t.refund}</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>{t.payTotal}</td><td colSpan={5}><strong>{formatPrice(total)}</strong></td></tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </AsyncView>

      {adding && (
        <AddPayment
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            success(t.paymentSaved);
            payments.reload();
          }}
        />
      )}
      {toRefund && (
        <Modal title={t.refundAsk} onClose={() => { setToRefund(null); setHideAd(false); }}>
          <p className="modal-text"><strong>{formatPrice(toRefund.amountPaise)}</strong> · {toRefund.recruiterName}</p>
          {toRefund.jobId && (
            <label className="check">
              <input type="checkbox" checked={hideAd} onChange={(e) => setHideAd(e.target.checked)} />
              <span>{t.refundAndHide}</span>
            </label>
          )}
          <Button tone="danger" icon="refresh" disabled={busy} onClick={refund}>{t.refund}</Button>
        </Modal>
      )}
    </section>
  );
}
