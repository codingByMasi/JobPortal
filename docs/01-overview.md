# 01 - Overview

**Jobs Abroad** shows job ads for work in the Gulf to people in India. Employers pay to show an ad. Job seekers never pay and never log in.

## Who uses it

| Role | Logs in? | What they can do |
|---|---|---|
| **Visitor / candidate** | No | See live ads, filter by country and kind of work, search, open an ad (zoom, download), apply on WhatsApp, apply with a form |
| **Recruiter (employer)** | Yes | Make an account, post an ad with a file, choose a package, see payment instructions, see their ads and status, edit while waiting for payment, delete, renew an ended ad, see their payments, see and WhatsApp their applicants |
| **Admin** | Yes | Everything: approve / reject / hide / show / edit / delete any ad, add an ad directly (no payment), mark an ad as paid, verify or block employers, add payments and mark refunds, edit packages, see all applications and download them as CSV |

## Life of an ad

```
Employer posts ad  ->  "Waiting for payment"  (can edit, can delete)
Employer pays by UPI, tells us on WhatsApp
Admin: "Mark as paid"  ->  "Waiting for approval"
Admin: "Approve"  ->  "Live until <date>"  (shown to visitors; featured ads first)
Time passes  ->  "Expired"  (hidden from visitors; employer can Renew = start a new ad from it)
Side paths: Admin "Reject" with a reason (employer sees it) - Admin "Hide" / "Show" - Delete (any time)
```

Statuses: `draft`, `pending_payment`, `paid_pending_review`, `live`, `hidden`, `rejected`, `expired`. Rules for who can do what are in `src/shared/lib/jobStatus.js`.

## Product rules (assumptions the owner can change)
- Employers cannot edit an ad after payment. They WhatsApp the admin to fix a typo.
- "Renew" creates a **new** ad (new payment) copied from the old one.
- A "Featured" package shows the ad at the top with a Featured tag. "Verified recruiter" is set by the admin.
- Only **live** ads can receive applications.
- Phase 1 payments are manual (UPI + WhatsApp). Online payment is Phase 2 (`08-phase2-payments.md`).

## Audience and design
Many users have little formal education. So: mobile first, large text, large buttons (52px or more), icons on every label, short plain words, Hindi/English toggle, one blue colour with green for action buttons.
