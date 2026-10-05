# 02 - Architecture

## The big picture
```
Browser (React app, static files on Netlify)
   |  api.listLiveJobs(), api.createJob(), ...        <- screens only know these names
   v
src/shared/data/index.js  --- picks one backend --->  supabase/  (real: Supabase database, login, storage)
                                                      demo/      (fake: same functions, data in the browser)
   v
Supabase: Postgres + Row Level Security + triggers + admin functions + Storage
```
There is no server of our own. The database enforces the rules; the screens only show them.

## Folders (see CLAUDE.md for the full tree)
- `features/*` - one folder per area; each has its own screens and small components.
- `shared/ui` - look and feel only. `shared/lib` - pure helpers with tests. `shared/i18n` - words. `shared/data` - the only code that talks to the database.
- `supabase/migrations` - the database, in numbered files.

## How data flows
1. A screen calls `useAsync(() => api.listMyJobs(user.id))`.
2. `api` (a small proxy) loads the real or demo backend the first time and calls the same-named function.
3. The backend returns **plain JavaScript objects** (camelCase, timestamps). `mappers.js` is the only place that converts database rows.
4. Errors carry a `code`; `friendlyError.js` turns any error into a plain sentence in the chosen language.

## State handling (kept small on purpose)
- **Login:** `features/auth/AuthContext` (user + profile).
- **Language:** `shared/i18n/LangContext` (remembered in localStorage).
- **Public jobs:** `features/jobs/JobsContext` (loaded once, saved copy on the phone for slow networks). It reloads by itself when `api` reports a change that affects visitors (`DATA_CHANGED` event, sent after any create/update/delete/admin write).
- **Everything else:** loaded per screen with `useAsync`, reloaded after an action.
No Redux and no React Query: the app is small and these are easier to read.

## Roles in the UI and in the database
- **UI:** `RequireRole` hides employer and admin screens from the wrong people. This is for convenience only.
- **Database (the real lock):** Row Level Security, triggers that lock fields, and admin-only functions. Details in `03-database-security.md`.

## Routes
`/`, `/jobs`, `/job/:id`, `/post-job`, `/contact`, `/login`, `/signup`, `/privacy`, `/terms`, `/dashboard` (+ `/new`, `/edit/:id`, `/pay/:id`, `/payments`, `/applications`), `/admin` (+ `/jobs`, `/jobs/new`, `/jobs/:id`, `/employers`, `/payments`, `/packages`, `/applications`).
Netlify serves `index.html` for every path (`public/_redirects`). At build time `scripts/prerender.mjs` also writes a real page for each live job so search engines and WhatsApp previews work.

## Three modes (decided at start-up in `shared/data/env.js`)
- **supabase**: both keys are set. Real data.
- **demo**: no keys, and you are developing (or `VITE_ALLOW_DEMO=true`). Fake data in the browser.
- **blocked**: a published site with no keys. Shows a "not ready" page. Never fake data.

## Demo mode
With no Supabase keys in `.env`, the app runs on the demo backend: sample ads, an employer, an admin, packages. Data is kept in the browser. It follows the same rules as the database and has tests (`demo.test.js`) so it cannot drift. A yellow banner shows "Demo mode".

## Known limits
- The public site loads all live ads in one request (up to 1000) and filters in the browser. That is fine for the first months. Past about 1000 live ads, add paging or server-side filters (change `listLiveJobs` and the Jobs screen only).
- A visitor who keeps one page open for hours will not see an ad end until the page reloads; the next load always hides it.

## Phase 2 in one line
Everything about payment is in `features/payments` plus `supabase/functions`. See `08-phase2-payments.md`.
