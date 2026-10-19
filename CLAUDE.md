# CLAUDE.md - Jobs Abroad

Read this first. It is the rulebook for anyone (human or AI) changing this project.

## What this is
A job-ads website for people in India looking for work abroad (Gulf countries). Employers pay to post ads.
Stack: Vite + React (plain JavaScript) + plain CSS + Supabase (database, login, file storage). No separate server.
Roles: **visitor/candidate** (no login), **recruiter** (login, posts ads for a fee), **admin** (everything).
Employers do not pay. A recruiter signs up, sends a license, and the admin verifies them. A verified recruiter posts ads for free; the admin approves each ad and chooses how many days it stays live, and can add days when it ends (`docs/08-phase2-payments.md`).
The owner is not deeply technical: explain decisions in short, plain words.

## Folder structure
```
CLAUDE.md                 this file
README.md                 5-minute start
docs/                     one document per topic (see list below)
supabase/
  migrations/             numbered SQL files = the source of truth for the database
  seed.sql                sample packages
  schema.sql              GENERATED from the above (npm run schema). Paste-once file.
public/                   images, icons, manifest (no _redirects: Cloudflare Pages serves the app for unknown addresses by itself)
scripts/                  build-time helpers: prerender (search pages + sitemap), schema builder, images
src/
  main.jsx, App.jsx       start-up and the route table ONLY
  config.js               owner settings (WhatsApp, UPI, site address). Placeholders marked PLACEHOLDER.
  app/                    Layout, ErrorBoundary, analytics
  features/
    jobs/                 public: home, list, filters, job page, apply form, public jobs state
    auth/                 login, signup, login state (AuthContext), route guard (RequireRole)
    ads/                  the ad form + file field + package picker (used by recruiter AND admin)
    recruiter/            employer area: my ads, license form (NeedVerification), post/edit ad, applications
    admin/                admin area
    site/                 contact, privacy/terms, post-a-job info, 404
  shared/
    ui/                   Button, Field, Icon, Modal, Notice, tabs, state views (look and feel, no business rules)
    lib/                  pure helpers: money, status rules, CSV, image shrinking, safe links, catalog
    i18n/                 en.js, hi.js, index.js, LangContext
    data/                 the ONLY place that talks to Supabase (supabase/) or the demo copy (demo/)
  styles/                 base.css, app.css
```
Tests sit next to the code they test (`*.test.js`) and in `scripts/*.test.mjs` (database security tests: `scripts/rls.test.mjs`, harness in `scripts/rls/`).

## Conventions
- **Names:** components `PascalCase.jsx`; everything else `camelCase.js`; CSS classes `kebab-case`; database `snake_case`; JavaScript objects `camelCase` (mappers convert).
- **One job per file.** Aim for under 200 lines per file (text files like `en.js` excepted). Every file starts with a one-line comment saying what it is for; every component has a one-line doc comment.
- **Imports go one way:** `app` and `features` may use `shared`. A feature may import another feature only for these shared pieces: `features/auth` (useAuth, RequireRole) and `features/ads` (the ad form and file field). `app` may also use `features/auth`. `shared` never imports from `features` or `app`.
- **Data rule:** only `src/shared/data` may import the Supabase library or touch the database. Screens call `api.something()`. Every new data function is added to BOTH `supabase/` and `demo/` with the same name, plus a test.
- **Text rule:** no words in components. All text lives in `shared/i18n/en.js` and `hi.js` with the same keys (a test checks it). Hindi must be simple.
- **Money rule:** money is whole paise in the database and code; `formatPrice` shows rupees. Never use floating-point rupees.
- **Status rule:** ad statuses and who may do what live in `shared/lib/jobStatus.js`. Do not repeat these rules in screens.
- **Admin rule:** things only an admin may do (approve, reject, hide, mark paid, refund) are database functions that check the status and write to `admin_log`; screens never write those fields directly.
- **Database rule:** change the database only with a NEW numbered file in `supabase/migrations`, then run `npm run schema`, then update `docs/03-database-security.md`. Never edit an old migration after it has been run on a real project (write a new one). **Every security-relevant SQL change needs a test in `scripts/rls.test.mjs`** (it runs the real migrations in a real Postgres engine); check that the test fails when you break the rule.
- **Config rule:** shop details (WhatsApp, UPI ID and name, emails, company name, site address) live in the database table `site_settings`, changed by the admin in Admin > Settings through `admin_save_settings` and read with `useSettings()`; `src/config.js` holds only example defaults for demo mode, and a real project hides whatever is not filled in (`shared/lib/siteSettings.js`). `npm run build` checks only that the two Supabase values are set (`scripts/checkConfig.mjs`). Security headers are written at build time (`scripts/headers.mjs`); add a new outside service there on purpose. Tests must never use `.env` (forced empty in `vite.config.js`).
- **Environment rule:** a published site without the two Supabase values must show the "not ready" page, never demo data (`shared/data/env.js`). Private pages use `usePageMeta(..., { noindex: true })`.
- **Accessibility:** big text and buttons, visible keyboard focus, labels on every input, respect reduced motion, 52px minimum tap size.
- **Errors:** never show technical words to users; use `friendlyMessage`. Every screen that loads data needs loading, empty and error states.

## Security rules (non-negotiable)
- No secrets in the frontend. Only the public anon key is allowed in the browser. The service-role key lives ONLY in Supabase and never in the repo.
- Row Level Security on every table. The database decides what is allowed; screen guards are only for convenience.
- Employers must not be able to change `status`, `package_id`, `starts_at`, `expires_at` or write payments. Triggers enforce it. Keep it that way.
- Validate every upload twice: in the browser (type, size, shrink) and in the database/bucket (type, size, own folder, link must point to our storage).
- Anything shown from the database is plain text. No raw HTML. File links must be https (`safeFileUrl`).

## Working rules
1. **Plan before any big task.** Say what you will do, in plain words, before doing it.
2. **Keep the code simple and the files small.** No new library without a written reason in `docs/09-decisions.md`.
3. **Security first** (see above).
4. **Be honest.** Flag risky or unclear requests before building. Say what is not tested.
5. **After each step run `npm test` and `npm run build`** and fix every error before saying done.
6. **Self-review like a strict code reviewer** before saying done: security, edge cases, empty/error states, Hindi text, mobile width, files too big, duplicated rules.
7. **Update the matching file in `docs/` with every change**, and add a line to `docs/CHANGELOG.md`.
8. **Build one step at a time.** After each step list 3 to 5 lines: what changed, what to test. Wait for the owner's "go".

## Commands
```
npm run dev       demo mode (no Supabase needed) or real mode when .env has the two Supabase values
npm run lint     code checker (ESLint)
npm run guides:publish   saves the guides in docs/ into the database (admin-only Guides screen)
npm test          unit and database-rule tests
npm run test:all  everything incl. browser tests, accessibility, Lighthouse (docs/07-testing.md)
npm run build     production build (+ search pages when Supabase and SITE_URL are set)
npm run schema    rebuild supabase/schema.sql from the migrations
```

## Docs
`docs/16-employer-guide.md`, `docs/17-job-seeker-guide.md` (English and Hindi) and `docs/18-app-features.md` explain the app to its users and are published for admins only with `npm run guides:publish` (Admin > Guides) - `docs/15-final-release-gate.md` final release gate - `docs/14-release-readiness-report.md` pre-launch test pass - `docs/12-live-test-report.md` live test on the real project - `docs/10-admin-guide.md` the admin's daily guide - `docs/11-owner-checklist.md` what only the owner can do - `docs/00-project-analysis.md` full review and finding status - `docs/01-overview.md` product by role - `02-architecture.md` how it fits together - `03-database-security.md` tables, rules, security checks - `04-screens.md` every screen and status - `05-i18n.md` words - `06-deploy.md` set-up and go-live - `07-testing.md` tests and hand checklist - `08-phase2-payments.md` why there is no online payment gateway - `09-decisions.md` why we chose what - `CHANGELOG.md` - `19-go-live-runbook.md` the steps to put a new version on the real site.
