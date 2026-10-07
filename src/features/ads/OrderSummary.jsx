// The small "what you pay" box under the plans: price, discount, bonus days, total and final days.
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';

/** `pkg` the chosen plan, `quote` its quote (may be missing while loading or when the quote failed). */
export default function OrderSummary({ pkg, quote }) {
  const { t } = useLang();
  if (!pkg) return null;
  const q = quote || { listPricePaise: pkg.pricePaise, discountPaise: 0, finalPricePaise: pkg.pricePaise, bonusDays: 0, finalDays: pkg.durationDays, offerName: '' };
  return (
    <dl className="order-summary" aria-label={t.summaryTitle}>
      <div><dt>{t.summaryPrice}</dt><dd>{formatPrice(q.listPricePaise)}</dd></div>
      {q.discountPaise > 0 && <div><dt>{t.summaryDiscount}{q.offerName ? ` (${q.offerName})` : ''}</dt><dd>- {formatPrice(q.discountPaise)}</dd></div>}
      {q.bonusDays > 0 && <div><dt>{t.summaryBonus}{q.offerName ? ` (${q.offerName})` : ''}</dt><dd>+ {t.pkgDays(q.bonusDays)}</dd></div>}
      <div className="order-total"><dt>{t.summaryTotal}</dt><dd>{q.finalPricePaise === 0 ? t.summaryFree : formatPrice(q.finalPricePaise)}</dd></div>
      <div><dt>{t.summaryDays}</dt><dd>{t.pkgDays(q.finalDays)}</dd></div>
    </dl>
  );
}
