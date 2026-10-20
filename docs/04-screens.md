# 04 - Screens

Every screen that loads data has **loading, empty and error** states (shared `StateViews`).
"Checked" = what has actually been tested so far. Update this table with every step.

| Route | Who | Folder | What it does | Checked |
|---|---|---|---|---|
| `/` | all | `features/jobs/Home` | fraud banner ("Never pay money for a job"), country buttons (to the country pages), kind-of-work buttons, featured ads, latest ads, real counters (`HomeCounters`: shown only when above zero) | demo, by hand + axe clean (Step 2) |
| `/jobs` | all | `features/jobs/Jobs` | filters (country, work, experience, salary), search, 5 at a time; salary = pick a currency that ads really show, then a lowest salary per month and "highest salary first" (never compares different currencies; `SalaryFilter`, `shared/lib/jobFilters`); the "New" tag for ads under 3 days; filters live in the address so links can be shared | demo, by hand + axe clean (Step 2) |
| `/job/:id` | all | `features/jobs/JobDetail` | big ad (zoom) or a big "Open the PDF" button (shown inside the page on wide screens only), details text, salary / experience / vacancies / last date / visa facts, registration number with Verified, fraud banner, Download, WhatsApp, Report this ad (a form saved in the database: `ReportAd`), Apply form with consent tick, tags; duplicate-apply message | demo, by hand + axe clean (Step 2) |
| `/agency?ra=NUMBER` | all | `features/jobs/AgencyPage` | one verified agency: name, registration number, its live ads (found by the registration number the ads already show; no phone or email); unknown number = a clear message with a way back; linked from "See their ads" on /agencies | browser tests (`e2e/agencies.spec.js`) |
| `/alerts/confirm?token=` and `/alerts/unsubscribe?token=` | all | `features/jobs/AlertLink` | the pages the links in the alert emails open; they say plainly if it worked; kept out of search engines. The **Get job alerts** button and pop-up (`AlertSignup`) are on `/jobs` and the country pages | demo tests, `e2e/alerts.spec.js` |
| `/jobs/:country` (uae, saudi-arabia, qatar, kuwait, oman, other-countries) | all | `features/jobs/CountryJobs` + `Jobs` | the ads of one country with its own title and text; same filters; unknown country = not-found page | demo tests, browser tests, accessibility scan |
| `/about`, `/faq`, `/refund-policy` | all | `features/site/InfoPage` | headed plain text from the language files (draft words for a professional) | browser tests, accessibility scan |
| `/delete-account` | all | `features/site/DeleteAccount` | email + note; saved as an open request; the page explains what is deleted | demo tests, browser tests |
| `/admin/guides` | admin | `features/admin/AdminGuides` | the guides, readable by admins only, with Copy and Print | demo tests, browser test |
| `/admin/settings` | admin | `features/admin/AdminSettings` | the shop details (WhatsApp, UPI ID and name, emails, company, site address) with a help line each; checks before saving; red reminder on the admin home while any is missing | demo tests, browser test |
| `/admin/reports` | admin | `features/admin/AdminReports` | reports about ads (reason, message, contact, find the ad, mark done, dismiss) and account deletion requests | demo tests, browser tests |
| `/post-job` | all | `features/site/PostJob` | 3 steps + the prices of the packages + the right button | demo, axe clean |
| `/contact`, `/privacy`, `/terms`, 404 | all | `features/site` | simple pages | by hand (earlier version) |
| `/login`, `/signup` | visitor | `features/auth` | employer login (demo logins shown in demo mode), signup; never sends an employer to /admin; not indexed by search engines | demo, by hand + axe clean |
| `/agencies` | all | `features/site/Agencies` | verified employers: company, registration number, live ads, "See their ads"; a note that being listed is not a promise | demo + `e2e/agencies.spec.js` + axe clean |
| `/check-agency` | all | `features/site/InfoPage` (kind "check") | seven plain steps for checking a recruitment agency, a button to the government eMigrate site, English and Hindi | demo + `e2e/agencies.spec.js` + axe clean |
| `/dashboard` | employer | `features/recruiter/MyAds` | my ads with plain-word status and buttons (Edit/Fix and send again, See, Renew, Delete/withdraw, Ask us to change this) | demo, by hand: every status, delete, renew + axe clean |
| `/dashboard/new` | employer | `features/recruiter/NewAd` + `features/ads/JobForm` (verified) or `features/recruiter/NeedVerification` (not verified: license number + file) | post ad: fields, optional salary and job facts (`JobFactsFields`), file upload (images shrunk to ~300 KB, PDF max 2 MB); no plan, price or coupon; "Send for approval" | demo + browser tests (`e2e/employer.spec.js`, `e2e/verification.spec.js`) + axe clean |
| `/dashboard/edit/:id` | employer | `features/recruiter/EditAd` | fix a rejected ad (or an older ad still waiting for payment) | demo, by hand |
| `/dashboard/applications` | employer | `features/recruiter` | list; WhatsApp button for each applicant | demo, by hand + axe clean |
| `/admin` (work queue) | admin | `features/admin/AdminHome` | counts: live, waiting approval, waiting payment, money this month; this month's money after discounts, discounts given, top offers by use | demo, by hand |
| `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/:id` | admin | `features/admin/AdminJobs`, `AdminJobDialogs`, `AdminJobForm` | all ads, filter, search (also by ad code AD-XXXXXXXX), **View ad file**, **More days (with reason), Make/Remove featured, Free ad (with note)** (`AdminJobExtras`), WhatsApp the employer, approve/reject/hide/show/mark paid (with reference)/edit/delete, add ad; hints for an employer's first ad and for one WhatsApp number used by several ads | demo, by hand: filter, search, Mark as paid, Approve, Reject (reason required), Hide/Show, Edit, Add ad, Delete + axe clean |
| `/admin/employers` | admin | `features/admin/AdminEmployers` + `AdminLicenseDialog` | license state per employer, **Check license** (number, date, file, **Verify this employer** or reject with a reason), block, see their ads | demo + `e2e/verification.spec.js` + axe clean |
| `/admin/payments` | admin | `features/admin/AdminPayments` | filters, add payment, mark refunded | demo, by hand: filters, add payment, refund, totals + axe clean |
| `/admin/packages` | admin | `features/admin/AdminPackages`, `AdminPackageForm` | plans: move up/down, edit price (rupees shown, paise saved), days, description, badge, featured, files; turn on/off; delete only when the plan has no ads; warning "price changes affect only new purchases" | demo tests, browser test (price change); not yet hand-checked in the real project |
| `/admin/offers` | admin | `features/admin/AdminOffers`, `AdminOfferForm`, `AdminRedemptions` | offers with status (Active / Scheduled / Expired / Used up / Off) and uses; create or edit with a plain-words example; coupon code with Make a code; copy; on/off; who used it. `?employer=ID` opens a new offer made for that employer (button "Give offer" on the Employers screen) | demo tests, browser test (make a coupon, employer uses it) |
| `/admin/history` | admin | `features/admin/AdminAudit` | change history of plans and offers, filter by what, change, day | demo tests, browser test |
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
