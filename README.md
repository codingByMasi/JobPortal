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
| `npm test` | all automated tests (about 160, including 59 security tests that run the real database rules) |
| `npm run build` | production build into `dist/` (also writes search pages and sitemap when Supabase and `SITE_URL` are set) |
| `npm run schema` | rebuild `supabase/schema.sql` after changing a migration |

## Settings you must change before launch
`src/config.js`: `WHATSAPP_NUMBER`, `UPI_ID`, `CONTACT_EMAIL`, `SITE_URL` (all marked `PLACEHOLDER`). Prices and package days are changed in the Admin > Packages screen.

## Documents
| File | About |
|---|---|
| `docs/01-overview.md` | what the product does, by role; life of an ad |
| `docs/02-architecture.md` | how the code fits together |
| `docs/03-database-security.md` | tables, who can do what, security checks |
| `docs/04-screens.md` | every screen and what has been tested |
| `docs/05-i18n.md` | how words and Hindi work |
| `docs/06-deploy.md` | Supabase and Netlify set-up, go-live checklist |
| `docs/07-testing.md` | automated tests and the hand checklist |
| `docs/08-phase2-payments.md` | plan for Razorpay |
| `docs/09-decisions.md` | why we chose what |
| `docs/CHANGELOG.md` | what changed in each step |

`design/` holds screenshots from the original Figma design for reference.
