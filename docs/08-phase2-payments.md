# 08 - Payments: employers do not pay (decision of the owner)

Employers do not pay to post ads, and the site has no payment gateway and no payment screens for employers.

How it works now:
1. An employer signs up and sends their **license** (number + picture or PDF).
2. The admin checks the license and **verifies** the employer (or rejects it with a reason). An employer cannot be verified without a license.
3. A verified employer **posts ads for free**. Each ad waits for the admin, who **approves it and chooses the days** it stays live.
4. When the days end the ad is no longer shown. The admin can **add days** and the ad goes live again.

See `docs/10-admin-guide.md` and `docs/16-employer-guide.md`.

## What is still in the code from the paid days
- The admin-only tools for money: **Payments**, **Packages**, **Offers**, **Mark as paid**, **Free ad**, **Refund**, and the database functions behind them (`admin_mark_paid`, `mark_job_paid`, `create_ad_order`, offers and plans). They work on ads made before posting became free and keep the records. Nothing in the employer's screens uses them. They can be removed later in a clean-up if the owner confirms they are never needed.
- The QR picture, the payment proof and the Razorpay code were removed (migrations 0025 and 0030). The admin's payment tools were kept on purpose: Payments, Packages, Offers, mark paid, free ad and refund.
- The status name `paid_pending_review` is the stored name of "waiting for approval" (renaming it would touch live data and many rules).

## If a payment gateway is ever wanted
Start from a clean plan: a gateway needs KYC and a website review, and overseas-job advertising may be a restricted category (ask first). The server must be the only thing that marks an ad paid, after checking the gateway's signed message; never trust the browser.
