// /dashboard/pay/:id - "Payment instructions" (phase 1: pay by UPI, tell us on WhatsApp, admin marks it paid).
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { canPay } from '../../shared/lib/jobStatus';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { paymentInfo } from './payments';
import { useAsync } from '../../shared/lib/useAsync';

/** Copies text to the clipboard (falls back to selecting it when the browser refuses). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Payment instructions for one ad. */
export default function Pay() {
  const { id } = useParams();
  const { t } = useLang();
  const { user } = useAuth();
  const [copied, setCopied] = useState(null); // null = not tried, true = copied, false = browser refused
  const data = useAsync(async () => (await api.listMyJobs(user.id)).find((j) => j.id === id) || null, [id, user.id]);

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.payTitle}</h2>
      <AsyncView state={data} isEmpty={(job) => !job} empty={t.errNotFound}>
        {(job) => {
          if (!canPay(job)) {
            return (
              <>
                <Notice tone="info">{job.finalPricePaise === 0 ? t.payFreeDone : t.payNotNeeded}</Notice>
                <Button to="/dashboard" icon="list">{t.goToAds}</Button>
              </>
            );
          }
          const info = paymentInfo(job, job.package);
          const amount = formatPrice(info.amountPaise);
          const waLink = info.whatsappLink(t.payWaMessage(info.reference, info.jobTitle, amount));
          return (
            <>
              <p className="help">{t.payHelp}</p>
              <dl className="pay-box">
                <div><dt>{t.colAd}</dt><dd>{job.title}</dd></div>
                <div><dt>{t.package}</dt><dd>{info.packageName}</dd></div>
                {info.discountPaise > 0 && <div><dt>{t.summaryPrice}</dt><dd><s>{formatPrice(info.listPricePaise)}</s> · {t.discountLine(formatPrice(info.discountPaise))}</dd></div>}
                {info.days > 0 && <div><dt>{t.summaryDays}</dt><dd>{t.pkgDays(info.days)}</dd></div>}
                <div><dt>{t.payAmount}</dt><dd className="pay-amount">{amount}</dd></div>
                <div><dt>{t.payUpiName}</dt><dd>{info.upiName}</dd></div>
                <div><dt>{t.payReference}</dt><dd><strong>{info.reference}</strong></dd></div>
                <div>
                  <dt>{t.payUpi}</dt>
                  <dd className="pay-upi">
                    <span>{info.upiId}</span>
                    <Button size="sm" tone="outline" icon="copy" onClick={async () => setCopied(await copyText(info.upiId))}>
                      {copied ? t.payCopied : t.payCopy}
                    </Button>
                    {copied === false && <span className="muted" role="status">{t.payCopyFailed}</span>}
                  </dd>
                </div>
              </dl>
              <ol className="steps">
                <li><span className="step-num">1</span><Icon name="card" size={28} /><span>{t.payStep1}</span></li>
                <li><span className="step-num">2</span><Icon name="rupee" size={28} /><span>{t.payStep2(amount, info.upiId)}</span></li>
                <li><span className="step-num">3</span><Icon name="whatsapp" size={28} /><span>{t.payStep3}</span></li>
              </ol>
              <div className="actions">
                <Button tone="blue" icon="rupee" href={info.upiLink}>{t.payUpiApp}</Button>
                <Button icon="whatsapp" href={waLink} target="_blank" rel="noopener noreferrer">{t.payPaidButton}</Button>
                <Button to="/dashboard" tone="outline" icon="list">{t.payLater}</Button>
              </div>
              <p className="help">{t.payWait}</p>
            </>
          );
        }}
      </AsyncView>
    </section>
  );
}
