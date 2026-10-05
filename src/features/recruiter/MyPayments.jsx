// /dashboard/payments - the employer's payments (read only).
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';

/** My payments list. */
export default function MyPayments() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const payments = useAsync(() => api.listMyPayments(user.id), [user.id]);
  return (
    <section className="section">
      <AsyncView state={payments} empty={t.payNone} emptyIcon="card">
        {(rows) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.colDate}</th><th>{t.colAd}</th><th>{t.colAmount}</th><th>{t.colHow}</th><th>{t.colStatus}</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label={t.colDate}>{formatDate(p.createdAt, lang)}</td>
                    <td data-label={t.colAd}>{p.jobTitle || '-'}</td>
                    <td data-label={t.colAmount}>{formatPrice(p.amountPaise)}</td>
                    <td data-label={t.colHow}>{p.method === 'razorpay' ? t.methodRazorpay : t.methodManual}</td>
                    <td data-label={t.colStatus}><span className={`badge badge-pay-${p.status}`}>{t.payStatus[p.status]}</span></td>
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
