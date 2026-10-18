// "Pay online" box on the payment screen: asks the server for a Razorpay order, opens the payment window, then waits for the server to confirm.
import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { formatPrice } from '../../shared/lib/money';
import { useLang } from '../../shared/i18n/LangContext';
import { useAuth } from '../auth/AuthContext';
import { openCheckout } from './checkout';

const POLL_EVERY_MS = 3000;
const POLL_TRIES = 20;

/** Pay online for one ad. `job` is the ad, `amountPaise` the saved price (shown only; the server uses its own copy). */
export default function OnlinePay({ job, amountPaise, companyName }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [state, setState] = useState('idle'); // idle | starting | confirming | done | slow | cancelled | error
  const [error, setError] = useState(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** The window's "success" only starts the wait; the ad is paid when the server (webhook) says so. */
  async function waitForServer() {
    setState('confirming');
    for (let i = 0; i < POLL_TRIES && alive.current; i += 1) {
      await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
      const mine = await api.listMyJobs(user.id).catch(() => null);
      const now = mine?.find((j) => j.id === job.id);
      if (now && now.status !== 'pending_payment') {
        if (alive.current) setState('done');
        return;
      }
    }
    if (alive.current) setState('slow');
  }

  async function start() {
    setError(null);
    setState('starting');
    try {
      const order = await api.createRazorpayOrder(job.id);
      await openCheckout({
        order,
        name: companyName || 'Jobs Abroad',
        description: job.title,
        email: user.email,
        phone: user.phone,
        onPaid: waitForServer,
        onDismiss: () => alive.current && setState((s) => (s === 'starting' ? 'cancelled' : s)),
      });
    } catch (err) {
      setError(err);
      setState('error');
    }
  }

  return (
    <div className="pay-online">
      <h3 className="section-title">{t.payOnlineTitle}</h3>
      <p className="help">{t.payOnlineHelp}</p>
      {state === 'done' ? (
        <>
          <Notice tone="success">{t.payOnlineDone}</Notice>
          <Button to="/dashboard" icon="list">{t.goToAds}</Button>
        </>
      ) : (
        <>
          {state === 'confirming' && <Notice tone="info">{t.payOnlineConfirming}</Notice>}
          {state === 'slow' && <Notice tone="info">{t.payOnlineSlow}</Notice>}
          {state === 'cancelled' && <Notice tone="info">{t.payOnlineCancelled}</Notice>}
          {state === 'error' && <Notice tone="error">{friendlyMessage(error, t)}</Notice>}
          {state === 'starting' && <p className="help" role="status">{t.payOnlineStarting}</p>}
          {state === 'slow' ? (
            <Button to="/dashboard" icon="list">{t.goToAds}</Button>
          ) : (
            <Button icon="card" disabled={state === 'starting' || state === 'confirming'} onClick={start}>{t.payOnlineButton(formatPrice(amountPaise))}</Button>
          )}
        </>
      )}
    </div>
  );
}
