# 08 - Phase 2: online payments (Razorpay) - built (Step 16), not yet tried against the real Razorpay

## What was built (Step 16)
- Migration `0023_razorpay.sql`: Razorpay ids on `payments`, table `razorpay_events` (each webhook event once, admins can read it to reconcile), `mark_job_paid()` (the one place that makes an ad paid; `admin_mark_paid` calls it), and four server-only functions (`razorpay_order_info`, `razorpay_attach_order`, `razorpay_capture`, `razorpay_refund`). Employers, admins and visitors cannot call them; only the service role can.
- Edge Functions: `supabase/functions/create-razorpay-order` and `supabase/functions/razorpay-webhook`, with shared helpers in `_shared/razorpay.js` (tested).
- Screen: `features/payments/OnlinePay.jsx` + `checkout.js`. Shown only when `VITE_RAZORPAY_KEY_ID` is set. After the Razorpay window says "paid" the screen only WAITS (checks My ads every 3 seconds for about a minute); the ad becomes paid only when the signed webhook arrives.
- Decisions made (by the owner): the admin still approves each ad after payment; manual UPI stays as a fallback. A new order is created at every click (an older order that gets paid later is recorded as `unknown_order` in `razorpay_events`: refund it by hand). Refunds started in the Razorpay dashboard mark the payment refunded (the ad is not hidden).
- Outcomes in `razorpay_events`: `paid`, `duplicate`, `unknown_order`, `amount_mismatch`, `not_waiting` (money arrived but the ad was no longer waiting, e.g. paid by hand meanwhile), `refunded`, `unknown_payment`, `not_paid`. Anything other than `paid`/`refunded`/`duplicate` needs a person to look at it.

## Set-up by hand (once)
1. Razorpay dashboard (test mode): copy the Key Id and Key Secret. Settings > Payment capture: **automatic**.
2. `supabase secrets set RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...  SITE_URL=https://your-site` (never in the repo).
3. `supabase functions deploy create-razorpay-order` and `supabase functions deploy razorpay-webhook --no-verify-jwt`.
4. Run migration 0023 (`npm run schema`, paste `supabase/schema.sql` or run the new file).
5. Razorpay dashboard > Webhooks: URL `https://<project>.supabase.co/functions/v1/razorpay-webhook`, the same secret as step 2, events **payment.captured** and **refund.processed**.
6. Hosting variable `VITE_RAZORPAY_KEY_ID=rzp_test_...` (public id only), rebuild.
7. Hand test (07-testing.md), then repeat with live keys.

# The original plan (kept for reference)

## Why it is easy to add
- All payment code is in `src/features/payments` (the screen) and `supabase/functions` (server code, not created yet). Nothing else in the app knows how payment works.
- The only entry point is `startPayment(job, navigate)` in `features/payments/payments.js`. Today it goes to the "Payment instructions" screen.
- The `payments` table already has `method` (`manual`/`razorpay`/`free_offer`/`complimentary`) and `status` (`created`/`paid`/`refunded`), and since 0018 every payment carries the price snapshot (list price, discount, final price, offer, final days). `startPayment()` and the payment screen read the amount from the saved snapshot, never from the plan.
- A free total (a 100% offer) is already marked paid inside `create_ad_order`; the Razorpay flow must skip the checkout when the final price is 0.
- "Paid" is decided in one database function. Today `admin_mark_paid`; in Phase 2 the shared part becomes `mark_job_paid(job, amount, method, reference)` which both the admin button and the webhook call, so there is one place that makes an ad "paid".

## What to build (in order)
1. **Razorpay account** in test mode. Keep the key secret and the webhook secret in Supabase **Edge Function secrets** only.
2. **A new migration (the next free number; 0014 is the last one used):** add `razorpay_order_id` and `razorpay_payment_id` (unique) to `payments`; add `mark_job_paid(...)` and make `admin_mark_paid` call it. Already in place from migration 0012 and useful for Razorpay: the price and days saved with the ad (`price_paise_at_order`, `days_at_order`), the payment `reference` (unique), one paid payment per ad, and `admin_refund_payment`. Still to add: a `failed` payment status, a table of webhook event ids (so one event is never processed twice), a reconciliation view (Razorpay report against `payments`), and refund handling from the webhook.
3. **Edge Function `create-razorpay-order`:** checks the caller is the ad's owner and the ad is `pending_payment`; reads the price **from the database, never from the browser**: since migration 0018 call `create_ad_order(job, package, coupon)` (or `quote_price_for(employer, package, coupon)` from the function with the service role) so offers, coupons and bonus days work exactly as in Phase 1; the order amount is the saved `final_price_paise`; creates the Razorpay order; stores a `created` payment; returns the order id.
4. **Edge Function `razorpay-webhook`:** verifies Razorpay's signature (HMAC-SHA256 with the webhook secret) before doing anything; is idempotent (same payment id twice does nothing); calls `mark_job_paid`; handles refunds.
5. **Frontend:** replace the body of `startPayment()` to call `create-razorpay-order` and open Razorpay Checkout; show "Payment received, waiting for approval" when done; keep the manual instructions as a fallback.
6. **CSP:** add Razorpay's script and frame addresses in `scripts/headers.mjs` on purpose.
7. **Test mode end to end**, then live mode. Add the hand test to `07-testing.md`.

## Ask Razorpay first
Razorpay needs real Terms, Refund/Cancellation, Privacy and Contact pages to activate an account, and may treat overseas-job advertising as a restricted category. Ask their support BEFORE building. Keep the UPI link with the ad code (`Pay.jsx`) as the fallback.

## Decisions to make before building
- Auto-approve ads after online payment, or keep admin approval? (Assumed: keep admin approval.)
- Refund rules and who clicks refund. GST invoices or receipts for fees.
- Failed or abandoned payments: how long an ad stays `pending_payment`.

## Do not
- Put the Razorpay secret, the service-role key or price decisions in the browser.
- Trust the browser saying "payment done". Only the verified webhook can mark paid.
