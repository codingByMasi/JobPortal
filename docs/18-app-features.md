# 18 - What the app does: features by role

One page that explains the whole product in plain words. Details for each role are in the guides: employers `16-employer-guide.md`, job seekers `17-job-seeker-guide.md`, admins `10-admin-guide.md`. How it is built: `02-architecture.md`. What only the owner can do: `11-owner-checklist.md`.

## In one minute
**Jobs Abroad** (deshduniyanaukri.com) shows job ads for work in the Gulf to people in India, in English and Hindi. Job seekers never log in and never pay. Employers (recruitment agents and companies) pay to show an ad. The admin team checks every ad and every payment before an ad goes live.

## Features for job seekers (no login)
- Browse the latest and **featured** ads; pages for **UAE, Saudi Arabia, Qatar, Kuwait, Oman and other countries**.
- **Filters** by country, kind of work and experience, plus a **search box**; a **New** tag for ads under 3 days.
- Each ad shows the employer's own **picture or PDF** (zoom, download, open PDF) and, when given, **salary, experience, vacancies, last date and visa type**; a **Verified** tag with the registration number when the admin has checked the employer.
- **Apply** by WhatsApp or by a short form (consent tick, one application per phone per ad).
- **Fraud warning** ("Never pay money for a job"), **Report this ad**, and **Delete my account**.
- Pages: About, Contact, Questions and answers, Privacy, Terms, Refund policy.
- English / Hindi switch on every screen; big text and big buttons; works on cheap phones and slow networks.
- Home page counters (live ads, verified employers, applications) appear only when the numbers are real.

## Features for employers (login)
- Sign up with company details and registration number, email confirmation, forgot-password.
- **Post an ad**: picture or PDF, details, optional salary and job facts, choose a **plan**.
- **Offers and coupons**: automatic best offer, or a typed code; the price, discount, bonus days and total are shown before saving and are worked out by the server.
- **Pay by UPI** (Phase 1): amount, UPI ID, name, ad code; send a WhatsApp screenshot; the admin marks it paid. Free offers skip payment.
- **My ads** with plain statuses; edit and delete while unpaid; **fix and send again** after a rejection; **renew** an ended ad; **ask us to change** a paid ad.
- **Applications** (names and phones after the company is verified), **My payments** and printable **receipts**, **My details**.

## Features for admins (login, optional two-step login)
- **Dashboard**: counts, money this month after discounts, discounts given, top offers, a reminder if Settings are missing.
- **All ads**: view the ad, approve, reject (with reason), hide, show, edit, delete, add an ad, mark paid (with the bank reference), **more days**, **featured on or off**, **free ad**.
- **Employers**: verify, block, see their ads and payments, **give an offer** to one employer.
- **Payments**: list, add, refund, download as a spreadsheet. **Applications**: search and download.
- **Packages** (plans): price, days, badge, order, on or off. **Offers**: percent, rupees off, extra days or free; coupon codes; dates and limits; who used them. **History**: every change of a plan or offer.
- **Reports** about ads and **account deletion requests**. **Change requests** from employers.
- **Settings**: WhatsApp number, UPI ID and name, emails, company name, site address (no code change needed).
- **Security**: two-step login with an authenticator app. **Problems**: crash list and the unused-files clean-up.
- How to make another person an admin: see "Making someone an admin" in `10-admin-guide.md`.

## How an ad lives
Waiting for payment, then (admin marks paid) waiting for approval, then (admin approves) live until its end date, then expired. Rejected ads can be fixed and sent again without paying again. Ads unpaid for 30 days are removed automatically.

## What protects people
- Every ad is read by a person before it goes live; payments are checked in the bank first.
- Only an admin can give the Verified tag; employers cannot change their status, price, dates or payments (the database enforces it).
- Limits stop floods of fake applications, reports and sign-ups; banned phone numbers cannot return.
- Applicants' details are shown only to verified employers and deleted after 180 days.
- Prices are always calculated by the server, never by the browser. The shop details are saved by admins and every change is logged.

## What is not built yet
CAPTCHA on the apply form; email or WhatsApp notices to employers; Hindi search-engine pages; a mobile app (not needed: the site works on phones).
