# 04 - Screens

Every screen that loads data has **loading, empty and error** states (shared `StateViews`).
"Checked" = what has actually been tested so far. Update this table with every step.

| Route | Who | Folder | What it does | Checked |
|---|---|---|---|---|
| `/` | all | `features/jobs/Home` | country buttons, kind-of-work buttons, featured ads, latest ads | demo, by hand + axe clean (Step 2) |
| `/jobs` | all | `features/jobs/Jobs` | filters (country, work), search, 5 at a time; filters live in the address so links can be shared | demo, by hand + axe clean (Step 2) |
| `/job/:id` | all | `features/jobs/JobDetail` | big ad (zoom) or a big "Open the PDF" button (shown inside the page on wide screens only), details text, Download, WhatsApp, Report this ad, Apply form with consent tick, tags; duplicate-apply message | demo, by hand + axe clean (Step 2) |
| `/post-job` | all | `features/site/PostJob` | 3 steps + the prices of the packages + the right button | demo, axe clean |
| `/contact`, `/privacy`, `/terms`, 404 | all | `features/site` | simple pages | by hand (earlier version) |
| `/login`, `/signup` | visitor | `features/auth` | employer login (demo logins shown in demo mode), signup; never sends an employer to /admin; not indexed by search engines | demo, by hand + axe clean |
| `/dashboard` | employer | `features/recruiter/MyAds` | my ads with plain-word status and buttons (Pay, Edit, See, Renew, Delete, Ask us to change this) | demo, by hand: every status, delete, renew + axe clean |
| `/dashboard/new` | employer | `features/recruiter/NewAd` + `features/ads/JobForm` | post ad: fields, file upload (images shrunk to ~300 KB, PDF max 2 MB), package cards | demo, by hand: validation, 39 MB photo shrunk to 284 KB, refused files, package cards + axe clean |
| `/dashboard/edit/:id` | employer | `features/recruiter/EditAd` | edit while waiting for payment | demo, by hand |
| `/dashboard/pay/:id` | employer | `features/payments/Pay` | package, price, UPI ID (copy, with a fallback message), WhatsApp "I have paid" | demo, by hand + axe clean |
| `/dashboard/payments`, `/dashboard/applications` | employer | `features/recruiter` | lists; WhatsApp button for each applicant | demo, by hand + axe clean |
| `/admin` | admin | `features/admin/AdminHome` | counts: live, waiting approval, waiting payment, money this month | demo, by hand |
| `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/:id` | admin | `features/admin/AdminJobs`, `AdminJobDialogs`, `AdminJobForm` | all ads, filter, search (also by ad code AD-XXXXXXXX), **View ad file**, WhatsApp the employer, approve/reject/hide/show/mark paid (with reference)/edit/delete, add ad; hints for an employer's first ad and for one WhatsApp number used by several ads | demo, by hand: filter, search, Mark as paid, Approve, Reject (reason required), Hide/Show, Edit, Add ad, Delete + axe clean |
| `/admin/employers` | admin | `features/admin/AdminEmployers` | verify, block, see their ads and payments | demo, by hand: verify, block (and the blocked employer's view), ads and payments pop-up + axe clean |
| `/admin/payments` | admin | `features/admin/AdminPayments` | filters, add payment, mark refunded | demo, by hand: filters, add payment, refund, totals + axe clean |
| `/admin/packages` | admin | `features/admin/AdminPackages` | add, edit price/days, turn on/off | demo, by hand: add, edit, turn off (and the employer picker follows) + axe clean |
| `/forgot-password`, `/reset-password` | visitor / link from email | `features/auth` | forgot password: email, then a link to a new password | demo tests; screens seen in demo; email part needs the real project |
| `/dashboard/profile` | employer | `features/recruiter/Profile` | company name, phone, registration number | demo tests |
| `/admin/security` | admin | `features/admin/AdminSecurity` | turn on two-step login (QR + first code); after that every admin login asks for a code (`MfaPrompt`) | needs the real project (demo has no authenticator app) |
| `/admin/problems` | admin | `features/admin/AdminProblems` | crashes reported by the website, clear list | demo tests |
| `/dashboard/receipt/:id` | employer | `features/recruiter/Receipt` | printable payment receipt (not a tax invoice) | demo |
| `/admin/requests` | admin | `features/admin/AdminRequests` | employers' change requests: open the ad to edit, WhatsApp the employer, mark done / decline | demo tests only; screen not yet hand-checked |
| `/admin/applications` | admin | `features/admin/AdminApplications` | search, WhatsApp, CSV download | demo, by hand: search, CSV download + axe clean |

## Status wording (employer sees)
(Rejected ads can be fixed and sent again; ended ads are renewed, not changed.)
Waiting for payment - Waiting for approval - Live until DATE - Hidden - Rejected: reason - Expired.

## Layout
Bottom nav on phones (Home, Jobs, Contact); same three items in the header on wide screens. Header also has an account button and the Hindi/English toggle. Tables become one card per row on phones.
