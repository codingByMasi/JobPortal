# Google AdSense

**What is on:** the AdSense script (publisher `ca-pub-6973524994504204`) is in `index.html`, so it is in every page, including the search pages made at build time. This is what Google checks when you add the site in AdSense, and it lets "Auto ads" run once you switch them on in AdSense.
**Security headers:** `scripts/headers.mjs` allows the Google ad addresses (script, frames, reports). Without this the browser would block the ads. Test: `scripts/headers.test.mjs`.
**Own ad boxes (optional):** `src/shared/ui/AdSlot.jsx` is placed under the job list and on the job page. It shows nothing until you create two ad units in AdSense and set `VITE_ADSENSE_SLOT_LIST` and `VITE_ADSENSE_SLOT_JOB` (the unit numbers) in the hosting settings. Never put it on login, employer or admin pages.
**Privacy page:** says the site shows Google ads (`privacyAds` in the text files).
**ads.txt:** `public/ads.txt` is served at `/ads.txt` as plain text (Cloudflare Pages serves real files before the app fallback). It holds `google.com, pub-6973524994504204, DIRECT, f08c47fec0942fa0`. AdSense shows "Not found" until this is live; it can take a day to turn to "Authorized".
**Not tested:** real ads on the live site (only Google can approve and show them). After release, check the browser console on the live site for blocked-by-policy messages.
