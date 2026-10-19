# 08 - Online payments: not used (decision of the owner)

No online payment gateway is used. Payment works like this and stays like this:

1. The employer sees the amount, your UPI ID and a QR code (your own uploaded picture, or one made from the UPI ID) on the payment screen.
2. The employer pays and sends a **payment proof**: the UTR reference number and a screenshot.
3. The admin checks the money in the bank or UPI app, then marks the ad paid (or rejects the proof with a reason).

See `docs/10-admin-guide.md` (QR picture, checking a payment) and `docs/03-database-security.md` (QR picture and payment proof).

## What is in the code
- `mark_job_paid()` (migration 0023): the one database function that makes an ad "paid". The admin's **Mark as paid** uses it.
- `startPayment()` in `src/features/payments/payments.js` sends the employer to the payment screen.

## If a payment gateway is ever wanted
Start from a clean plan: a gateway needs KYC and a website review, and overseas-job advertising may be a restricted category (ask first). The server must be the only thing that marks an ad paid, after checking the gateway's signed message; never trust the browser. Earlier work on this is in the git history (commits `d44f3ff` and `cd2a722`).
