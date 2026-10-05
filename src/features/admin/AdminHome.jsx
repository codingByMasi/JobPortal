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
            <Link className="count-card" to="/admin/payments">
              <Icon name="card" size={32} />
              <span className="count-number">{formatPrice(c.revenuePaise)}</span>
              <span>{t.cRevenue}</span>
            </Link>
          </div>
        )}
      </AsyncView>
    </section>
  );
}
