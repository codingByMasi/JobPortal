# 07 - Testing

## Automated (`npm test`)
Run before every "done". Currently 162 tests (about 8 seconds):
| Area | What is proven |
|---|---|
| `shared/lib/jobStatus` | status names, who can edit/renew, admin buttons per status, featured-first order, approval dates |
| `shared/lib/money` | paise to rupees, typed prices (no rounding mistakes), bad prices refused |
| `shared/lib/compress` | allowed file types (JPG/PNG/WebP/PDF only; SVG, GIF, EXE, HTML refused), PDF over 2 MB refused, picture size rule |
| `shared/lib/csv`, `safeUrl`, `friendlyError` | spreadsheet-formula protection, only https links, no technical words in errors |
| `shared/data/mappers` | unsafe file links dropped, demo-only base64 pictures, featured/verified, WhatsApp number cleaning |
| `shared/data/demo/demo.test.js` | **the database rules, on the demo backend**: visitors see only live ads; employers see only their own data, always start `pending_payment`, cannot change locked fields, cannot approve or mark paid, cannot post when blocked; the whole journey post -> mark paid -> approve -> apply -> hide -> delete; expiry; counts; refunds |
| `shared/data/supabase/public.test.js` | the REAL backend's public calls, against a recording stand-in for Supabase: reads the `public_jobs` view (never `jobs`), maps featured/verified/safe links, inserts only applicant fields, never reads applications back, repeat applications become a plain message |
| `shared/i18n` | Hindi has exactly the English keys; no empty text |
| `scripts/rls.test.mjs` | **59 security tests on the REAL database rules** (real Postgres engine, real migrations). See `03-database-security.md` |
| `shared/data/env.test.js`, `features/auth/landing.test.js`, `shared/lib/urlParams.test.js` | a published site without keys is blocked (never fake data); login never sends an employer to /admin; filter helper |
| `scripts/schema.test.mjs` | `schema.sql` is up to date; every table has RLS; the locking rules and storage rules exist in the SQL; admin functions check `is_admin()` |
| `scripts/pages.test.mjs` | search pages, Google job data, sitemap; HTML from ads is escaped |

**Limit:** none of these tests run Supabase's own services (Auth, Storage API, pg_cron, email). Those, and the keys, must be checked once by hand on the real project (below).

## Hand checklist (demo mode or real project)
Tick these on the real project once, and again before every big release. **Hand-checked in demo mode in Steps 2-4: items 1-13** (see CHANGELOG for what was seen).
1. **Employer signup:** /signup with a new email and a password of 8+ characters -> lands on /dashboard, "You have no ads yet". Bad phone, bad email, short password and a used email each show a plain message.
2. **Post ad:** Post an ad -> fill fields, choose a picture, choose a package -> "Save and go to payment" -> payment instructions show price, UPI ID, WhatsApp button. My ads shows **Waiting for payment**. Edit works; Delete asks first.
3. **Upload rules:** a huge photo is shrunk (a 39 MB test photo became 284 KB, 1200 px wide); a PDF over 2 MB is refused with plain words; an .svg/.exe is refused; a refused file keeps the previous good file.
4. **Mark paid (admin):** log in as admin -> All ads -> **Mark as paid** (asks first) -> status becomes **Waiting for approval**; Payments shows the money.
5. **Approve / Reject:** Approve -> **Live until DATE**. Reject needs a reason (button stays off until you type one); the employer then sees "Rejected: reason".
6. **Public:** the ad appears on / and /jobs; Featured ads come first with a Featured tag; a verified employer shows "Verified recruiter".
7. **Apply:** open the ad, send the form -> clear success message; a second try with the same phone says you already applied. The employer sees the applicant and can WhatsApp them; admin sees it too and can download CSV.
8. **Hide / Show:** Hide -> ad disappears for visitors; Show brings it back.
9. **Delete:** Delete (asks first) -> ad, its applications and its file are removed; the payment record stays.
10. **Expiry:** admin edits the ad's end date to yesterday -> it disappears from the site at once and shows **Expired** to the admin; after the cron runs its status is **Expired** in the database; the employer sees **Renew**, which opens a new ad filled from the old one.
11. **Blocked employer:** admin blocks an employer -> that employer sees a plain notice and cannot post or edit. Admin accounts cannot be blocked.
12. **Language:** switch to Hindi on every screen above; nothing shows technical words (employer-typed text and package names stay as typed).
13. **Phone width:** every screen works at 375 px wide, with no sideways scrolling (tables become cards). Also checked at 1280 px.
14. **Real project only:** email confirmation link works; a 15 MB file is refused by Storage; an .exe renamed .jpg is refused by Storage; pg_cron changes an ended ad to Expired within 10 minutes.

## Public site on the real project (Step 2)
Follow `06-deploy.md` section C2 with `supabase/sample-ads.sql`. Expected: 3 live ads (first Featured + Verified), the ended / hidden / unpaid samples never show, Apply works once per phone, language toggle works, `/job/<id>` of an ended ad says "This job is not available now".

## Security check (real project only)
Run the 8-point list in `03-database-security.md` with two employer accounts and a visitor.

## Accessibility
Automated axe scan (WCAG 2.1 AA) at 375 px in English and Hindi: **clean on every public, employer and admin screen** (one finding on the turned-off package row was fixed). Re-run after any visual change.
