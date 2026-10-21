# 18 - What the app does: features by role

One page that explains the whole product in plain words. Details for each role are in the guides: employers `16-employer-guide.md`, job seekers `17-job-seeker-guide.md`, admins `10-admin-guide.md`. How it is built: `02-architecture.md`. What only the owner can do: `11-owner-checklist.md`.

## In one minute
**Jobs Abroad** (deshduniyanaukri.com) shows job ads for work in the Gulf to people in India, in English and Hindi. Job seekers never log in and never pay. Employers (recruitment agents and companies) pay to show an ad. The admin team checks every ad and every payment before an ad goes live.

## Features for job seekers (no login)
- Browse the latest and **featured** ads; pages for **UAE, Saudi Arabia, Qatar, Kuwait, Oman and other countries**.
- **Six languages:** English, Hindi, Malayalam, Tamil, Telugu and Urdu (right to left), chosen in the footer. The job seeker screens are translated; privacy, terms, FAQ, articles and the employer and admin areas stay in English for the four newer languages for now.
- **Optional spam check** (Cloudflare Turnstile) on the Apply and Report forms, off until the owner switches it on.
- **Help articles** (4 short guides in English and Hindi), a **free CV maker** that prints or saves a one-page PDF (nothing stored or sent), and an **install bar** to put the site on the phone's home screen.
- **Admin Activity tab:** what the admins did, newest first, with a filter.
- **Job alerts:** a job seeker leaves an email (after choosing a country or kind of work if they like), confirms it, and gets one email a day with new matching ads; one tap to unsubscribe.
- **Agency page:** each verified agency has its own page (name, registration number, live ads), opened from the Verified agencies list.
- **Filters** by country, kind of work, experience and **salary** (a currency, a lowest monthly salary, highest first), plus a **search box**; a **New** tag for ads under 3 days.
- Each ad shows the employer's own **picture or PDF** (zoom, download, open PDF) and, when given, **salary, experience, vacancies, last date and visa type**; a **Verified** tag with the registration number when the admin has checked the employer.
- **Apply** by WhatsApp or by a short form (consent tick, one application per phone per ad).
- **Fraud warning** ("Never pay money for a job"), **Report this ad**, and **Delete my account**.
- Pages: About, Contact, Questions and answers, Privacy, Terms, Refund policy.
- English / Hindi switch on every screen; big text and big buttons; works on cheap phones and slow networks.
- Home page counters (live ads, verified employers, applications) appear only when the numbers are real.

## Features for everyone (no login)
- **Share this job on WhatsApp** on every ad.
- **Verified agencies**: the employers whose license our team checked (company, registration number, live ads).
- **How to check an agency**: a safety guide with a link to the government eMigrate website.

## Features for employers (login)
- Sign up with company details and registration number, email confirmation, forgot-password.
- **Get verified**: send the license number and a picture or PDF of the license; see if it is being checked or was rejected (with the reason) and send again.
- **Post an ad** (verified employers only): picture or PDF, details, optional salary and job facts. Free; no plan, price or payment. It waits for the admin's approval.
- **My ads** with plain statuses, an "Ends in N days" note and an **Ask for more days** button; **withdraw** a waiting, rejected or ended ad; **fix and send again** after a rejection; **renew** an ended ad; **ask us to change** an approved ad.
- **Edit an ad while it waits for approval**; **views and applications** for each ad; **My details** with the email choice; **Applications** (names and phones after the company is verified).
- **Emails** about verification, approval, rejection, added days, ending soon and ended (off until the email key is set).

## Features for admins (login, optional two-step login)
- **Dashboard (work queue)**: licenses to check, ads waiting for approval, ads ending in 3 days, change requests, ads that ended in the last 30 days, live ads; each card opens that list. A reminder if Settings are missing.
- **All ads**: view the ad, **approve and choose the days**, reject (with reason), hide, show, edit, delete, add an ad, **more days** (also for ended ads, which then go live again), **featured on or off**.
- **Employers**: **check the license** (open the file, verify or reject with a reason), block, see their ads. An employer cannot be verified without a license.
- **Faster work:** ready-made reasons for rejecting, approve several ads at once, and pictures of deleted ads cleaned up by themselves.
- **Applications**: search and download. **History**: every change of a plan or offer.
- Older tools for ads made before posting became free (kept for the records): **Payments**, **Packages**, **Offers**, mark paid, free ad, refund.
- **Reports** about ads and **account deletion requests**. **Change requests** from employers.
- **Settings**: WhatsApp number, emails, company name, site address (no code change needed).
- **Security**: two-step login with an authenticator app. **Problems**: crash list and the unused-files clean-up.
- How to make another person an admin: see "Making someone an admin" in `10-admin-guide.md`.

## How an ad lives
Waiting for approval, then (admin approves and chooses the days) live until its end date, then expired and no longer shown. The admin can add days to an ended ad and it goes live again. Rejected ads can be fixed and sent again.

## What protects people
- Only verified employers can post, and only after the admin checked their license. Every ad is read by a person before it goes live.
- Only an admin can give the Verified tag; employers cannot change their status, dates or verification (the database enforces it).
- Limits stop floods of fake applications, reports and sign-ups; banned phone numbers cannot return.
- Applicants' details are shown only to verified employers and deleted after 180 days.
- Prices are always calculated by the server, never by the browser. The shop details are saved by admins and every change is logged.

## What is not built yet
CAPTCHA on the apply form; email or WhatsApp notices to employers; Hindi search-engine pages; a mobile app (not needed: the site works on phones).
