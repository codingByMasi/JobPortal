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
| 14 | Recruiters cannot edit after payment; Renew = new ad | Keeps the paid, approved ad exactly as reviewed | Editing live ads (needs re-approval flow) |
| 15 | Ad file links must point at our own storage (database trigger) | Stops outside pictures, tracking and phishing links | Trusting any https link |
| 16 | Images shrunk in the browser (about 300 KB, max 1200 px wide); PDFs max 2 MB | Fast on slow phones, cheap storage | Uploading originals |
| 17 | Extra libraries: only `@supabase/supabase-js`, `react-router-dom`, Vitest (dev) | Everything else is small enough to write | UI kits, Tailwind, date libraries |
| 18 | Supabase-only mode uses the public anon key in the browser | Safe only because every table has RLS | Putting the service-role key anywhere in the frontend (never) |
| 19 | Dev-only library `@electric-sql/pglite` (Postgres inside Node) to test the real SQL rules | Without it the security rules could only be checked as text or on a copy; with it every rule is proven on a real engine in 3 seconds, in CI, with no account. Not shipped to users | Trusting the SQL by reading it; hand-testing only; a Docker database (heavy for a non-technical owner) |
| 20 | A published site with no Supabase keys shows a "not ready" page, never demo data (`VITE_ALLOW_DEMO=true` to allow on purpose) | A typo in hosting settings must never turn the live site into a fake one | Silent fallback to demo |
| 21 | Private pages are `noindex` (meta tag), not blocked in robots.txt | A blocked page cannot show its "noindex" instruction | robots.txt Disallow |
| 22 | Limits in the database (20 unpaid ads, 200 files, 1000 applications per ad, one per phone) | Browsers can be bypassed; the limits protect cost and cleanliness | Limits only in the screens |
| 23 | Package names are shown exactly as the admin types them (hint: write Hindi and English) | Avoids a second set of columns for translated names | `name_hi` columns |

## Changed from the first plan
- Data access is one folder (`shared/data`) split by area, instead of one `api.js` per feature. Reason: the demo copy must stay in sync with the real one, and one folder makes that easy to see.
