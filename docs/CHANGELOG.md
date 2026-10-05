# Changelog

## Step 5 - Hardening
- **Real database tests:** the real migrations now run in a real Postgres engine (PGlite) and 59 tests act as visitor / employer / blocked employer / admin (`scripts/rls.test.mjs`). Four deliberate breakages of the rules were all caught.
- **New database limits (migration 0009):** max 20 ads waiting for payment, max 200 files per employer, profile text length limits, public view explicitly read-only, and mark-as-paid now locks the ad (no double payment when two admins click together).
- **Production safety:** a published site without Supabase keys shows a "not ready" page instead of fake demo data; private pages (login, signup, dashboard, admin) are `noindex`.
- Login redirect rule extracted and tested (`landingPath`); an employer can no longer be sent to an admin address.
- Checked: no dangerous HTML patterns, no secrets in the repo, `npm audit` clean, full production build under the real security headers shows no violations.
- Tests: 74 -> 162.
- Docs: security doc now describes how each rule is tested and what is NOT covered (Supabase's own services).

## Step 4 - Admin area (hand-verified in demo mode)
- Checked every admin screen by hand: dashboard counts; all-ads list with status filter and search; Mark as paid, Approve, Reject (reason required), Hide/Show, Edit (incl. end date), Add ad, Delete; employers (verify, block, ads and payments pop-up; admin cannot be blocked); payments (filters, add, refund, totals); packages (add, edit, turn off, employer picker follows); applications (search, CSV).
- Fixed: turned-off package row failed the contrast rule; "No payments yet" / "No one has applied yet" were shown for empty *searches* (now "found" wording); package form reminds to write Hindi and English names.
- Axe clean on all admin screens at 375 px in both languages; no sideways scrolling at 375 px or 1280 px.

## Step 3 - Employer area (hand-verified in demo mode)
- Checked by hand: signup validation, post ad (a 39 MB photo shrunk to 284 KB at 1200 px; wrong types and a 3 MB PDF refused; refused files keep the previous good file), package cards, payment instructions, my ads in every status, edit, delete (asks first, Esc, focus kept in pop-up), renew (prefilled, old ad stays expired), payments and applications lists, blocked-employer view, rejected-with-reason view, logout and page guards.
- Fixed: a form error stayed on screen after being fixed (now clears as soon as the box is edited); a bad email said "fill this box" (now says what is wrong); the Copy button did nothing visible when the browser blocked copying (now says how to copy by hand); an employer sent to login from /admin landed on /admin after logging in.

## Step 2 - Public site on real data
- Saved copy on the phone: an ad that ended since the last visit no longer shows (`publicJobs` in `jobStatus.js`, tested).
- Apply form protection (migration 0008): one application per ad per phone number (last 10 digits), at most 1000 per ad. Plain messages in both languages. The demo backend follows the same limits.
- `supabase/sample-ads.sql`: test ads for a real project (3 live incl. one featured, 1 ended, 1 hidden, 1 unpaid).
- New tests (now 87) for the real Supabase public calls using a recording stand-in client.
- Fixed: the brand name was cut off ("Jobs Abr...") on phones; it now fits in English and Hindi.
- Hand-checked in demo mode at 375 px: 9 public pages x 2 languages have no sideways scrolling and zero axe (WCAG 2.1 AA) problems; filters and search (and their links), featured-first order, empty state, zoom (focus, Esc, scroll lock), PDF embed and fallback link, apply + duplicate message in both languages, expiry by admin edit (ad leaves the public list at once).

## Step 1 - Foundation
- Reorganised `src/` into `app/`, `features/*`, `shared/*`, `styles/`. All imports updated; app behaves as before.
- Split the two big data files into small modules by area under `shared/data/supabase` and `shared/data/demo`; added a guard so a missing data function fails loudly.
- Split the translations into `en.js` and `hi.js` (+ key-match test).
- Database: one big SQL file became numbered migrations (`0001`-`0007`) + `seed.sql`; `schema.sql` is now generated (`npm run schema`) and tested.
- **Security fix found in self-review:** a trigger now makes `file_url` point only at our own storage and match `file_path` (before, any https link was accepted).
- Build-time search pages now read live ads from Supabase instead of the old Google Sheet; security headers allow Supabase.
- Tests grew from 42 to 74 (rules of the demo backend, status rules, money, uploads, CSV, errors, mappers, SQL checks, data-change signal).
- Bug fix found by hand-testing: after an admin approved or changed an ad, the public list did not update until a full reload. Now every data change that affects visitors makes the public list reload (`DATA_CHANGED` signal in `shared/data/index.js`).
- Bug fix: the Payments footer was labelled "Money this month" but totalled all shown rows; now "Total paid (rows shown)".
- Login with an unconfirmed email now says so in plain words (before: a generic error).
- Wrote `CLAUDE.md` and `docs/01`-`09`; rewrote `README.md`.

## Before Step 1 (prototype)
- Phase 1 screens and data layer written in a flat structure (public site, employer area, admin area, demo mode, Supabase SQL). Partly hand-tested in demo mode.
