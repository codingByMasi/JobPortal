// /admin - four big numbers: live ads, waiting for approval, waiting for payment, money this month.
import { Link } from 'react-router-dom';
import Icon from '../../shared/ui/Icon';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';

/** Admin dashboard counts. Each number links to the matching list. */
export default function AdminHome() {
  const { t } = useLang();
  const counts = useAsync(() => api.adminCounts(), []);
  const sales = useAsync(() => api.adminSalesStats(), []);
  return (
    <section className="section">
      <AsyncView state={counts} isEmpty={() => false}>
        {(c) => (
          <div className="count-grid">
            <Link className="count-card" to="/admin/jobs?status=live">
              <Icon name="eye" size={32} />
              <span className="count-number">{c.live}</span>
              <span>{t.cLive}</span>
            </Link>
            <Link className="count-card" to="/admin/jobs?status=paid_pending_review">
              <Icon name="clock" size={32} />
              <span className="count-number">{c.review}</span>
              <span>{t.cReview}</span>
            </Link>
            <Link className="count-card" to="/admin/jobs?status=pending_payment">
              <Icon name="rupee" size={32} />
              <span className="count-number">{c.waitingPayment}</span>
              <span>{t.cPay}</span>
            </Link>
            <Link className="count-card" to="/admin/requests">
              <Icon name="edit" size={32} />
              <span className="count-number">{c.requests}</span>
              <span>{t.cRequests}</span>
            </Link>
            <Link className="count-card" to="/admin/payments">
              <Icon name="card" size={32} />
              <span className="count-number">{formatPrice(c.revenuePaise)}</span>
              <span>{t.cRevenue}</span>
            </Link>
          </div>
        )}
      </AsyncView>
      <h2 className="section-title">{t.salesTitle}</h2>
      <AsyncView state={sales} isEmpty={() => false}>
        {(s) => (
          <>
            <div className="count-grid">
              <div className="count-card">
                <Icon name="rupee" size={32} />
                <span className="count-number">{formatPrice(s.revenuePaise)}</span>
                <span>{t.salesRevenue}</span>
              </div>
              <div className="count-card">
                <Icon name="badge" size={32} />
                <span className="count-number">{formatPrice(s.discountPaise)}</span>
                <span>{t.salesDiscounts}</span>
              </div>
            </div>
            <h3>{t.topOffers}</h3>
            {s.topOffers.length === 0 ? <p className="muted">{t.noOfferUse}</p> : (
              <ul className="mini-list">
                {s.topOffers.map((o) => <li key={o.offerId}><span>{o.name}</span><span>{t.offerUsedTimes(o.uses)} · {formatPrice(o.discountPaise)}</span></li>)}
              </ul>
            )}
          </>
        )}
      </AsyncView>
    </section>
  );
}
