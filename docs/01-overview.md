# 01 - Overview

**Jobs Abroad** shows job ads for work in the Gulf to people in India. Verified employers post ads for free and the admin approves every ad. Job seekers never pay and never log in.

## Who uses it

| Role | Logs in? | What they can do |
|---|---|---|
| **Visitor / candidate** | No | See live ads, filter by country and kind of work, search, open an ad (zoom, download), apply on WhatsApp, apply with a form |
| **Recruiter (employer)** | Yes | Make an account (with a CAPTCHA if turned on, and a tick to accept the employer rules), reset a forgotten password, send their license to be verified, (once verified) post an ad with a file and details (free, no plan to choose), see their ads and status, fix a rejected ad (then send again), withdraw a waiting, rejected or ended ad, renew an ended ad, ask for a change to an approved ad, correct their company details, and (once verified) see and WhatsApp their applicants |
| **Admin** | Yes (and a code from an authenticator app, once turned on) | View the ad file, approve (choosing the days) / reject / hide / show / edit / extend / delete any ad, add an ad directly, check an employer's license and verify or reject it, block employers, download applications as CSV, handle employers' change requests, WhatsApp employers. (Older payment tools for ads made before posting became free are still there: see `10-admin-guide.md`.) |

## Life of an ad

```
Employer signs up  ->  sends license  ->  Admin checks it: "Verify" (or rejects it with a reason; the employer sends again)
Verified employer posts ad  ->  "Waiting for approval"  (free; can be withdrawn)
Admin: "Approve" and chooses the days  ->  "Live until <date>"  (shown to visitors; featured ads first)
Time passes  ->  "Expired"  (hidden from visitors; the admin can add days and it is live again; the employer can also Renew = start a new ad from it)
Side paths: Admin "Reject" with a reason (employer sees it, fixes the ad and presses "send again") - Admin "Hide" / "Show" - Employer can withdraw only waiting, rejected or ended ads - Admin can delete any ad
```

Statuses: `draft`, `pending_payment` (only ads made before posting became free), `paid_pending_review` (the stored name of "waiting for approval"; kept so old data and rules stay valid), `live`, `hidden`, `rejected`, `expired`. Rules for who can do what are in `src/shared/lib/jobStatus.js`.

## Product rules (assumptions the owner can change)
- Employers cannot edit an ad once it is approved. They press **Ask us to change this** (up to 3 open requests per ad); the admin sees it in **Change requests**, edits the ad, and marks the request done or declined.
- "Renew" creates a **new** ad (waiting for approval again) copied from the old one.
- A "Featured" package shows the ad at the top with a Featured tag. "Verified recruiter" is set by the admin.
- Only **live** ads can receive applications. Names and phone numbers of applicants are shown to an employer only after the admin has verified the company (otherwise the employer sees how many applied). Applications are deleted after 180 days.
- Blocking an employer hides all their live ads. Changing the company name or registration number removes the "verified" tag until the admin checks again.
- There are no payments for employers (`08-phase2-payments.md`).

## Audience and design
Many users have little formal education. So: mobile first, large text, large buttons (52px or more), icons on every label, short plain words, Hindi/English toggle, one blue colour with green for action buttons.
