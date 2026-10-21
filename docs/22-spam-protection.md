# 22 - Spam protection on the Apply and Report forms (Cloudflare Turnstile)

The Apply form and the Report form can ask a visitor to pass Cloudflare Turnstile ("I am not a robot"). It is **off until you turn it on**. When it is on, the **database itself** refuses a form that has no valid one-time pass, so someone calling the database directly (not through the website) is stopped too.

## How it works
1. The form shows the Turnstile box (only when `VITE_TURNSTILE_SITE_KEY` is set in Cloudflare Pages: the same key that signup already uses).
2. When the visitor sends the form, the website sends the Turnstile answer to the Edge Function **verify-human**. It asks Cloudflare whether the answer is good. If yes, it saves a **one-time pass** in `human_passes` and returns its id. Nothing about the visitor is kept.
3. The website sends the form with that pass in the row (`human_pass`). The database trigger on `applications` and `reports` (`human_check`) accepts a pass that exists, is younger than 10 minutes and is unused, and uses it up. The pass is never stored in the row.
4. A form that fails its other rules (same phone again, ad no longer live, too many from one connection) does **not** use up the pass: it is all one database step that is undone.
5. Passes older than a day are deleted every day (`purge_human_passes`).

The existing limits stay: one application per phone per ad, 1000 per ad, 30 forms an hour and 100 a day per connection, 10 reports an hour.

## Turning it on (once; needs your Cloudflare Turnstile keys)
Do the steps in this order. If you turn the rule on before the site key is in the website, nobody can apply or report until you finish.
1. **Cloudflare Turnstile:** make a widget for `deshduniyanaukri.com` (if signup already uses Turnstile you can use the same widget). You get a **site key** and a **secret key**.
2. **Website:** in Cloudflare Pages > Settings > Variables, set `VITE_TURNSTILE_SITE_KEY` (production) to the site key, then publish again. Forms now show the check.
3. **Supabase secrets** (the secret key goes ONLY here, never in the repository or in chat):
   ```
   npx supabase secrets set TURNSTILE_SECRET_KEY=... --project-ref <your project>
   ```
   (`SITE_URL` is already set for the email function.)
4. **Deploy the function:** `npx supabase functions deploy verify-human --no-verify-jwt`
5. **Test with the rule still off:** open an ad on the live site, pass the check, apply with a test phone number. It should work.
6. **Switch the rule on** (Supabase > SQL Editor):
   ```sql
   update public.app_settings set value = 'on' where key = 'require_human';
   ```
7. **Test again:** applying works with the check; a direct call without a pass is refused.
**To switch it off again:** `update public.app_settings set value = 'off' where key = 'require_human';`

## If something goes wrong
- *Forms say "Please finish the security check":* the check did not load (ad blocker, no internet) or the key is wrong. Switch the rule off (above) while you fix it. Check Supabase > Edge Functions > verify-human > Logs.
- *Cloudflare says the hostname is not allowed:* add `deshduniyanaukri.com` to the widget's allowed hostnames.

## Tests
`scripts/rls.human.test.mjs` (rule off by default; on: no pass, unknown pass, old pass refused; a pass works once; a failed form does not use it up; the report form too; the tables and helper functions are closed; clean-up; each rule broken on purpose once to see a test fail), `scripts/humancheck.test.mjs` (Cloudflare's answer decides, bad tokens, no secret key, only our own website may call it from a browser), `src/shared/data/supabase/humanPass.test.js` (with and without a site key). **Not tested against the real Cloudflare:** do steps 5 and 7 once.
