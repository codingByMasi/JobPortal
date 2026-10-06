// ============================================================================
// PAYMENTS - the ONE place online payment will plug in later (Phase 2).
//
// Today (Phase 1): startPayment() sends the employer to the "Payment instructions" screen
// (pay by UPI, then tell us on WhatsApp; an admin marks the ad as paid).
//
// Phase 2: replace the body of startPayment() with: ask the server (a Supabase Edge Function)
// to create a Razorpay order for this job, open Razorpay Checkout, and let a webhook mark the
// ad paid. Nothing else in the app needs to change.
// ============================================================================
import { UPI_ID, UPI_NAME, WHATSAPP_NUMBER } from '../../config';
import { adReference } from '../../shared/lib/adReference';
import { whatsappLink } from '../../shared/lib/format';

/** A link that opens the UPI app with payee, amount and note already filled in. */
export function upiLink({ upiId, upiName, amountPaise, reference }) {
  const q = new URLSearchParams({ pa: upiId, pn: upiName, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: reference });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/** Everything the instructions screen shows for one ad. */
export function paymentInfo(job, pkg) {
  return {
    packageName: pkg?.name || '',
    amountPaise: pkg?.pricePaise ?? 0,
    upiId: UPI_ID,
    upiName: UPI_NAME,
    reference: adReference(job.id),
    upiLink: upiLink({ upiId: UPI_ID, upiName: UPI_NAME, amountPaise: pkg?.pricePaise ?? 0, reference: adReference(job.id) }),
    whatsappNumber: WHATSAPP_NUMBER,
    whatsappLink: (message) => whatsappLink(WHATSAPP_NUMBER, message),
    jobId: job.id,
    jobTitle: job.title,
  };
}

/** Where the employer goes to pay for `job`. `navigate` is react-router's navigate function. */
export function startPayment(job, navigate) {
  navigate(`/dashboard/pay/${job.id}`);
}
