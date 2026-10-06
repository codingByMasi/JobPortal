# 01 - Overview

**Jobs Abroad** shows job ads for work in the Gulf to people in India. Employers pay to show an ad. Job seekers never pay and never log in.

## Who uses it

| Role | Logs in? | What they can do |
|---|---|---|
| **Visitor / candidate** | No | See live ads, filter by country and kind of work, search, open an ad (zoom, download), apply on WhatsApp, apply with a form |
| **Recruiter (employer)** | Yes | Make an account (with a CAPTCHA if turned on, and a tick to accept the employer rules), reset a forgotten password, post an ad with a file and details, choose a package, pay by UPI (app link with the amount and an ad code), see their ads and status, edit while waiting for payment or after a rejection (then send again), delete unpaid/rejected/ended ads, renew an ended ad, see their payments, ask for a change to a paid ad, correct their company details, and (once verified) see and WhatsApp their applicants |
| **Admin** | Yes (and a code from an authenticator app, once turned on) | View the ad file, approve / reject / hide / show / edit / delete any ad, add an ad directly (no payment), mark an ad as paid (with the bank/UPI reference), verify or block employers, add payments and mark refunds (can also hide the ad), download payments and applications as CSV, edit packages, handle employers' change requests, WhatsApp employers |

## Life of an ad

```
Employer posts ad  ->  "Waiting for payment"  (can edit, can delete)
Employer pays by UPI, tells us on WhatsApp
Admin: "Mark as paid"  ->  "Waiting for approval"
Admin: "Approve"  ->  "Live until <date>"  (shown to visitors; featured ads first)
Time passes  ->  "Expired"  (hidden from visitors; employer can Renew = start a new ad from it)
Side paths: Admin "Reject" with a reason (employer sees it, fixes the ad and presses "send again", no new payment) - Admin "Hide" / "Show" - Employer can delete only unpaid, rejected or ended ads - Admin can delete any ad
```

Statuses: `draft`, `pending_payment`, `paid_pending_review`, `live`, `hidden`, `rejected`, `expired`. Rules for who can do what are in `src/shared/lib/jobStatus.js`.

## Product rules (assumptions the owner can change)
- Employers cannot edit an ad after payment. They press **Ask us to change this** (up to 3 open requests per ad); the admin sees it in **Change requests**, edits the ad, and marks the request done or declined.
- "Renew" creates a **new** ad (new payment) copied from the old one.
- A "Featured" package shows the ad at the top with a Featured tag. "Verified recruiter" is set by the admin.
- Only **live** ads can receive applications. Names and phone numbers of applicants are shown to an employer only after the admin has verified the company (otherwise the employer sees how many applied). Applications are deleted after 180 days.
- **Refund rule (assumption, confirm with an accountant):** if we reject a paid ad the employer gets the money back; once an ad has been live there is no refund unless we made a mistake.
- Blocking an employer hides all their live ads. Changing the company name or registration number removes the "verified" tag until the admin checks again.
- Phase 1 payments are manual (UPI + WhatsApp). Online payment is Phase 2 (`08-phase2-payments.md`).

## Audience and design
Many users have little formal education. So: mobile first, large text, large buttons (52px or more), icons on every label, short plain words, Hindi/English toggle, one blue colour with green for action buttons.
