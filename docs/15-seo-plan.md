# 15 - SEO and link previews: the plan and the trade-offs

## The problem in plain words
The site is a "single-page app": the browser downloads one empty page and builds the screen with JavaScript. Google can read this, but slowly and not always. **WhatsApp and Facebook cannot run JavaScript**, so a shared ad link shows only the generic site name and picture unless the page already contains the ad's title and picture in its HTML. For a job site that lives on WhatsApp shares, this matters most.

## Options for Cloudflare Pages

| Option | What it is | Good | Not so good | Cost / effort |
|---|---|---|---|---|
| **A. Build-time pre-rendering (chosen, already running)** | Every deploy, a script reads the live ads and writes one HTML page per ad, per country and per fixed page, plus the sitemap. The normal app still takes over in the browser. | No server to run or pay for; fast (plain files from Cloudflare); small code; works with the current app | A **new ad has no page until the next deploy**. Until then its link shows the generic preview. Fix: a deploy hook called every 3 hours (set in Cloudflare) and a manual "deploy now" button | Free. Already built; extended in this step |
| B. Cloudflare Pages Function for /job/:id | A small server function that reads the ad from Supabase and writes the preview tags the moment someone asks | New ads get a correct preview at once | Server code to keep and test; needs the Supabase address in the function settings; free tier has a daily limit (100,000 requests) | Free at our size; about 1 day of work. **Recommended later**, only if employers complain that the preview of a brand-new ad is blank |
| C. Full server-side rendering (Next.js, Remix) | Rewrite the app in a framework that renders on the server | Best SEO, everything instant | A rewrite of the whole app and its tests; a server to run; more things to break | Weeks. Not worth it at this stage |
| D. Paid pre-rendering service | A service that renders pages for crawlers | No code changes | Monthly fee; another company in the chain; a user-agent trick Google dislikes | Not recommended |

**Recommendation: A now, B later if needed.** It is the simplest and cheapest, and it already covers the most important cases: Google sees every ad and country page in the text of the page, and WhatsApp shows the ad's own picture and title for every ad that existed at the last deploy.

## What is built for A in this step
- **Country pages** `/jobs/uae`, `/jobs/saudi-arabia`, `/jobs/qatar`, `/jobs/kuwait`, `/jobs/oman`, `/jobs/other-countries`: own title ("Jobs in UAE | Jobs Abroad"), description, canonical address, and the list of ads written as links into the page text (up to 50 per page). The Home country buttons now open these pages.
- **Fixed pages** About, FAQ, Refund policy, Delete my account: titles and descriptions (also set inside the app for every page, in English and Hindi, with `usePageMeta`).
- **Sitemap** now has the home page, the fixed pages, the country pages and every ad. `robots.txt` points to it.
- **Google job data** (JobPosting) now carries the salary (per month), the number of openings and the last date (the earlier of the last date and the end of the ad).
- Pages are flat files (`jobs/uae.html`, `job/<id>.html`) so Cloudflare serves them at the exact address with no redirect.

## What it cannot do yet (be aware)
- A new ad's link shows the generic preview until the next deploy (up to 3 hours with the hook; see `docs/13-cloudflare-pages.md`).
- Search engines need weeks to start showing a new site. Add the site in Google Search Console and submit `sitemap.xml` after launch (owner task).
- Hindi pages: the search-engine text of pre-rendered pages is English. The app switches to Hindi in the browser. Separate Hindi addresses (for example `/hi/jobs/uae`) would help Hindi searches; that is a later decision.
- Real Google "job" results need the employer to be real and the ad text to be in the page. Our ads are pictures, so the description for Google is a short line built from the title, company and place; the facts (salary, last date) are what make it useful.

## How to check after launch
1. Open `https://your-site/sitemap.xml` and `https://your-site/robots.txt` (the sitemap address must have no double slash).
2. Open `https://your-site/jobs/uae`, right-click, "View page source": the ad titles must be in the text.
3. Paste an ad link into WhatsApp "message yourself": title and picture must show.
4. In Google Search Console, "URL inspection" on one ad and one country page; "Rich results test" on one ad (job data).
