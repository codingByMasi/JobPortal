# 08 - Phase 2: online payments (Razorpay) - plan only, nothing built yet

## Why it is easy to add
- All payment code is in `src/features/payments` (the screen) and `supabase/functions` (server code, not created yet). Nothing else in the app knows how payment works.
- The only entry point is `startPayment(job, navigate)` in `features/payments/payments.js`. Today it goes to the "Payment instructions" screen.
- The `payments` table already has `method` (`manual`/`razorpay`) and `status` (`created`/`paid`/`refunded`).
- "Paid" is decided in one database function. Today `admin_mark_paid`; in Phase 2 the shared part becomes `mark_job_paid(job, amount, method, reference)` which both the admin button and the webhook call, so there is one place that makes an ad "paid".

## What to build (in order)
1. **Razorpay account** in test mode. Keep the key secret and the webhook secret in Supabase **Edge Function secrets** only.
2. **Migration 0008:** add `razorpay_order_id` and `razorpay_payment_id` (unique) to `payments`; add `mark_job_paid(...)` and make `admin_mark_paid` call it.
3. **Edge Function `create-razorpay-order`:** checks the caller is the ad's owner and the ad is `pending_payment`; reads the price **from the database, never from the browser**; creates the Razorpay order; stores a `created` payment; returns the order id.
4. **Edge Function `razorpay-webhook`:** verifies Razorpay's signature (HMAC-SHA256 with the webhook secret) before doing anything; is idempotent (same payment id twice does nothing); calls `mark_job_paid`; handles refunds.
5. **Frontend:** replace the body of `startPayment()` to call `create-razorpay-order` and open Razorpay Checkout; show "Payment received, waiting for approval" when done; keep the manual instructions as a fallback.
6. **CSP:** add Razorpay's script and frame addresses in `netlify.toml` on purpose.
7. **Test mode end to end**, then live mode. Add the hand test to `07-testing.md`.

## Decisions to make before building
- Auto-approve ads after online payment, or keep admin approval? (Assumed: keep admin approval.)
- Refund rules and who clicks refund. GST invoices or receipts for fees.
- Failed or abandoned payments: how long an ad stays `pending_payment`.

## Do not
- Put the Razorpay secret, the service-role key or price decisions in the browser.
- Trust the browser saying "payment done". Only the verified webhook can mark paid.
