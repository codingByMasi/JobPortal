# 09 - Decisions (why we chose what)

| # | Decision | Why | Rejected |
|---|---|---|---|
| 1 | Vite + React, plain JavaScript | Static files, simple hosting, small bundle | Next.js (needs a server we do not want); TypeScript (slower for the owner to review; revisit for Phase 2 money code) |
| 2 | Supabase for database, login, files | One service, Row Level Security, no server of our own | Own server; Firebase |
| 3 | Folders by feature (`features/*`), shared code in `shared/` | "Change the admin payments screen" = one folder | Flat `pages/components/lib` (gets confusing past ~40 files) |
| 4 | Only `src/shared/data` touches Supabase; screens call `api.*` | One place to find, test and fix data problems; lets demo mode swap in | Supabase calls inside screens |
| 5 | Demo backend with the same function names + tests | Every screen can be tried without a project; rules cannot drift because tests check them | No demo mode |
| 6 | React Router | Standard, already used | Hand-made routing |
| 7 | Small own `useAsync` + contexts for state | App is small; no extra library to learn | Redux, React Query |
| 8 | Plain controlled forms + small validators | Forms are short | Form libraries |
| 9 | i18n = two plain files + key-match test | Owner can edit words; zero dependencies | i18next |
| 10 | Roles enforced in the database (RLS, triggers, admin functions); screen guards only for convenience | Anyone can bypass a screen, nobody bypasses the database | UI-only checks |
| 11 | Public website reads a **view** (`public_jobs`) | Shows "Verified" and "Featured" without letting visitors read profiles | Giving visitors read access to profiles |
| 12 | Money in whole paise | No rounding errors | Rupee decimals |
| 13 | Migrations are numbered files; `schema.sql` is generated and tested | Safe, reviewable changes; one paste-once file that cannot go stale | One hand-edited big file |
| 14 | Recruiters cannot edit after payment; Renew = new ad | Keeps the paid, approved ad exactly as reviewed | Editing live ads (needs re-approval flow). Changes go through "Ask us to change this" (change requests, migration 0011) |
| 15 | Ad file links must point at our own storage (database trigger) | Stops outside pictures, tracking and phishing links | Trusting any https link |
| 16 | Images shrunk in the browser (about 300 KB, max 1200 px wide); PDFs max 2 MB | Fast on slow phones, cheap storage | Uploading originals |
| 17 | Extra libraries: only `@supabase/supabase-js`, `react-router-dom`, Vitest (dev) | Everything else is small enough to write | UI kits, Tailwind, date libraries |
| 18 | Supabase-only mode uses the public anon key in the browser | Safe only because every table has RLS | Putting the service-role key anywhere in the frontend (never) |
| 19 | Dev-only library `@electric-sql/pglite` (Postgres inside Node) to test the real SQL rules | Without it the security rules could only be checked as text or on a copy; with it every rule is proven on a real engine in 3 seconds, in CI, with no account. Not shipped to users | Trusting the SQL by reading it; hand-testing only; a Docker database (heavy for a non-technical owner) |
| 20 | A published site with no Supabase keys shows a "not ready" page, never demo data (`VITE_ALLOW_DEMO=true` to allow on purpose) | A typo in hosting settings must never turn the live site into a fake one | Silent fallback to demo |
| 21 | Private pages are `noindex` (meta tag), not blocked in robots.txt | A blocked page cannot show its "noindex" instruction | robots.txt Disallow |
| 22 | Limits in the database (20 unpaid ads, 200 files, 1000 applications per ad, one per phone) | Browsers can be bypassed; the limits protect cost and cleanliness | Limits only in the screens |
| 23 | Package names are shown exactly as the admin types them (hint: write Hindi and English) | Avoids a second set of columns for translated names | `name_hi` columns |
| 24 | The file link is built by the database, not accepted from the browser (supersedes #15) | Checking only the end of a link let any website pass; the owner also wants no outside links at all | Pattern checks on the link |
| 25 | Admin actions (approve, reject, hide, show, mark paid, refund) are database functions that check the ad's status and write a log line | Direct table writes allowed any status jump and left no trace | Direct updates from the browser |
| 26 | The price and days are saved with the ad when it is made | A later package change must not change what a waiting employer pays or how long an approved ad runs | Reading the current package at payment time |
| 27 | Employers delete only unpaid, rejected or ended ads; a rejected ad can be fixed and sent again | A paid ad deleted by its owner wiped the applicants and lost the link to the money; a rejected ad was a dead end | Delete any time |
| 28 | Applicants' names and phones go only to verified employers (switchable in `app_settings`) | A cheap ad must not be a way to collect job seekers' phone numbers | Every paying employer sees them |
| 29 | Visitors read ads only through the view `public_jobs`; the apply rule uses a small function | Reading the `jobs` table exposed owner ids and internal fields | A read policy on `jobs` |
| 30 | Admin two-step login is enforced by the database only once the admin has turned it on | Cannot lock out the owner during set-up; stolen password alone is no longer enough | Always required (risk of lock-out) |
| 31 | Security headers are written at build time (`scripts/headers.mjs`) | The policy must name your own Supabase project, which is only known from the settings | A fixed policy in a hand-written headers file with `*.supabase.co` |
| 32 | Employer and admin screens load on demand (`React.lazy`) | Visitors on slow phones should not download admin code | One bundle |
| 33 | Small list pictures (about 40 KB) are made in the browser at upload | Lists loaded 5-6 full pictures per page | Supabase image resizing (paid) |
| 34 | A "send us a change request" flow instead of editing paid ads | Keeps what the admin approved | Re-approval after every edit |
| 35 | Hosting on Cloudflare Pages (was Netlify) | Static site with no server code; no per-request bandwidth charge for static files; many Indian locations; free plan limits (500 builds a month, 20,000 files, 25 MiB a file) are far above our need. Because the output is plain static files it can later move to Workers static assets or another host without code changes | Netlify (credit-based limits), Vercel (free plan is not for commercial use), GitHub Pages (no custom headers) |
| 36 | Apply-form flood limits in the database, per scrambled visitor address, generous (30 an hour, 100 a day) | A CAPTCHA needs an Edge Function; this stops cheap bots now, and shared mobile addresses are not locked out | CAPTCHA only; no limit |
| 37 | Crash reports go to our own small table, not an outside service | No account, no new library, no change to the security headers, and no visitor data leaves the country | Sentry or similar (can still be added) |
| 38 | Two development-only libraries for browser and accessibility tests: `@playwright/test` and `@axe-core/playwright` | The release needs repeatable tests of the real screens at phone and desktop width and a WCAG check on every screen; writing that by hand is not realistic. They are not shipped to visitors (0 vulnerabilities, only in `devDependencies`). | Manual browser checks only; Cypress |
| 39 | Employers do not pay; a verified employer posts for free and the admin approves each ad and chooses its days (migration 0028). The QR-code library that was added for a payment screen was removed again | The owner wants to control who can post by checking a license, not to take money per ad. Checking the license is the gate; approving every ad is the second gate | Per-ad payment by UPI, QR and proof; an online payment gateway |

## Changed from the first plan
- Data access is one folder (`shared/data`) split by area, instead of one `api.js` per feature. Reason: the demo copy must stay in sync with the real one, and one folder makes that easy to see.


## Employer emails are styled HTML plus a plain-text copy (step 25)
Why: plain text looked unprofessional. The page uses simple tables and inline styles (works in Gmail, Outlook and phones), no library, no images, no tracking. Anything an employer typed is escaped, and only links under our own https address are allowed. The plain-text copy stays for mail apps and spam filters.

## CV maker prints with the browser; the install bar has no service worker (step 30)
Why: a CV library or a PDF generator would add weight and a new thing to keep safe. The browser can already print a page or save it as a PDF, so the CV is a plain page with a print style that shows only the CV. Nothing typed is stored or sent. The install bar listens for the browser's own install offer; we did not add a service worker because an offline copy of the site could show old job ads. If the browser does not offer installing (for example Safari on iPhone), the bar simply does not show.

## ESLint added as a development tool (step 11)
Why: the project had no code checker. It found a real mistake on its first run (a text key written twice, so the first text was silently ignored). It is a development tool only (`eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `globals`): nothing is added to the website the visitors download. Two style rules of the newest hooks plugin are switched off because they flag data-loading patterns that work correctly here. Run it with `npm run lint`; it also runs in CI and in `npm run test:all`.
