// /dashboard/receipt/:id - a printable payment receipt (not a tax invoice). The browser's Print button saves it as a PDF.
import { useParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import { AsyncView } from '../../shared/ui/StateViews';
import { UPI_NAME } from '../../config';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { adReference } from '../../shared/lib/adReference';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** One receipt. */
export default function Receipt() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { user, profile } = useAuth();
  usePageMeta(t.receiptTitle, undefined, { noindex: true });
  const data = useAsync(async () => (await api.listMyPayments(user.id)).find((p) => p.id === id) || null, [id, user.id]);

  return (
    <section className="section narrow-form">
      <AsyncView state={data} isEmpty={(p) => !p} empty={t.errNotFound}>
        {(p) => (
          <article className="receipt">
            <h2 className="section-title">{t.receiptTitle}</h2>
            <p className="help">{t.receiptNote}</p>
            <dl className="pay-box">
              <div><dt>{t.receiptFrom}</dt><dd>{UPI_NAME}</dd></div>
              <div><dt>{t.receiptTo}</dt><dd>{profile?.companyName}</dd></div>
              <div><dt>{t.receiptNumber}</dt><dd>{adReference(p.id)}</dd></div>
              <div><dt>{t.colDate}</dt><dd>{formatDate(p.createdAt, lang)}</dd></div>
              <div><dt>{t.colAd}</dt><dd>{p.jobTitle || '-'}</dd></div>
              <div><dt>{t.colAmount}</dt><dd className="pay-amount">{formatPrice(p.amountPaise)}</dd></div>
              <div><dt>{t.payReferenceLabel}</dt><dd>{p.reference || '-'}</dd></div>
              <div><dt>{t.colStatus}</dt><dd>{t.payStatus[p.status]}</dd></div>
            </dl>
            <div className="actions no-print">
              <Button icon="download" onClick={() => window.print()}>{t.receiptPrint}</Button>
              <Button to="/dashboard/payments" tone="outline" icon="back">{t.back}</Button>
            </div>
          </article>
        )}
      </AsyncView>
    </section>
  );
}
