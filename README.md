# Jobs Abroad

A simple, mobile-first job-ads website for people in India looking for work in the Gulf. Employers pay to post ads; job seekers never log in or pay.
Vite + React + plain CSS, with Supabase (database, login, file storage). Hindi / English.

> Working on this project? Read **CLAUDE.md** first, then the documents in **docs/**.

## Start in 2 minutes (demo mode, no account needed)
```
npm install
npm run dev
```
Open the address it prints. A yellow banner says **Demo mode**: sample ads, packages, an employer and an admin, all kept in your browser only. The Login page shows the demo logins.

## Use the real database
1. Follow **docs/06-deploy.md** (create the Supabase project, paste `supabase/schema.sql`, make yourself admin).
2. Copy `.env.example` to `.env` and paste the two Supabase values.
3. `npm run dev` again. The yellow banner disappears.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | run on your computer |
| `npm test` | unit and database-rule tests (344, including about 200 security tests that run the real database rules) |
| `npm run test:all` | everything: tests, build, audit, browser tests, accessibility, Lighthouse (see `docs/07-testing.md`) |
| `npm run build` | production build into `dist/`: checks the database connection (stops on Cloudflare Pages if the two Supabase values are missing), writes the security headers, and writes search pages and sitemap when Supabase and `SITE_URL` are set |
| `npm run schema` | rebuild `supabase/schema.sql` after changing a migration |

## Settings you must change before launch
The WhatsApp number, UPI ID, name on the UPI ID, emails, company name and site address are filled in by the admin in the app: **Admin > Settings** (no code change, no new release). Until a setting is filled in, the site hides the button or text that needs it. Then read `docs/11-owner-checklist.md`. Prices and package days are changed in the Admin > Packages screen.

## Documents
| File | About |
|---|---|
| `docs/01-overview.md` | what the product does, by role; life of an ad |
| `docs/02-architecture.md` | how the code fits together |
| `docs/03-database-security.md` | tables, who can do what, security checks |
| `docs/04-screens.md` | every screen and what has been tested |
| `docs/05-i18n.md` | how words and Hindi work |
| `docs/06-deploy.md` | Supabase and Cloudflare Pages set-up, go-live checklist |
| `docs/13-cloudflare-pages.md` | Cloudflare Pages readiness: what was checked, what to set in the dashboard |
| `docs/07-testing.md` | automated tests and the hand checklist |
| `docs/08-phase2-payments.md` | plan for Razorpay |
| `docs/09-decisions.md` | why we chose what |
| `docs/10-admin-guide.md` | the daily guide for the admin, in plain words |
| `docs/11-owner-checklist.md` | what only the owner can do (accounts, lawyer, accountant, settings) |
| `docs/14-release-readiness-report.md` | the full pre-launch test pass: verdict, results, blockers, launch checklist |
| `docs/12-live-test-report.md` | the test on the real Supabase project: what passed, what broke, what is untested |
| `docs/00-project-analysis.md` | the full review of the project and the status of every finding |
| `docs/CHANGELOG.md` | what changed in each step |

`design/` holds screenshots from the original Figma design for reference.

**Guides for the people who use the app** (`docs/16-employer-guide.md`, `docs/17-job-seeker-guide.md` in English and Hindi, `docs/10-admin-guide.md`, `docs/18-app-features.md`) are saved in the database and shown only to admins in **Admin > Guides**; publish changes with `npm run guides:publish`. Make someone an admin with `node scripts/make-admin.mjs person@example.com`.
