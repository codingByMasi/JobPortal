# 10 - Admin guide (plain words)

For the person who runs the site every day. No technical knowledge needed. Use the **Admin** tabs: Dashboard, All ads, Employers, Payments, Packages, Applications, Change requests, Security.

## Every day (about 15 minutes)
1. **Dashboard**: look at the four numbers. Tap "Waiting for approval", "Change requests".
2. **Payments in**: an employer pays by UPI and WhatsApps you the screenshot with their ad code (looks like `AD-1A2B3C4D`).
   - Open **bank / UPI app** and find the payment. Check the amount and that the note has the same ad code. **Never mark paid from a screenshot alone.**
   - **All ads**: search the code. Tap **Mark as paid**. Type the **reference number (UTR)** from your bank or UPI app. Each reference can be used only once; if the site says it was already used, someone is trying to use one payment twice.
3. **Approve ads** (status "Waiting for approval"):
   - Tap **View ad** and read the whole ad. Reject if it asks job seekers for money (visa fee, registration fee, "security deposit"), has no company or contact, looks fake, or shows a personal document.
   - If the row says **"First ad of this employer"**: call or WhatsApp the employer's number first. Ask who they are and for the registration number if they are a recruitment agent. Check the number on `emigrate.gov.in` (after your lawyer tells you exactly what to check).
   - If the row says **"N other ads use the same WhatsApp number"**: look at those ads. One number behind many companies is a warning sign.
   - Good ad: **Approve**. Bad ad: **Reject** and write a short reason the employer can understand ("Please add a phone number"). They can fix the ad and send it again without paying again.
4. **Change requests**: employers cannot edit a paid ad; they ask you. Tap **Open the ad to edit**, make the change, come back and tap **Mark done** (or **Decline** if you cannot). Tap **WhatsApp them** to tell them.
5. **Employers**: tap **Verify** only when you are sure about the company (see the checklist below). Tap **Block** for a bad employer: all their live ads are hidden at once.

## Verify an employer: checklist
- You spoke to them on the phone or WhatsApp number they gave.
- Company name matches their ad and their messages.
- A recruitment agent in India: registration number is filled in and you checked it.
- No complaints about them.
Only after a **verified** tick can they see applicants' names and phone numbers. Changing the company name or registration number removes the tick, and you check again.

## Reports and complaints
Job seekers can press **Report this ad**; it opens WhatsApp with the ad code. Open the ad (search the code). If it is bad: **Hide** it, then **Block** the employer if needed, then **Refund** if the money was taken by mistake. Answer the person who reported within 2 days (this is the promise on the Contact page).

## Refunds
- You rejected a paid ad and the employer will not fix it: refund the full amount. Do the bank transfer yourself, then in **Payments** tap **Mark refunded** (tick "Also hide this ad" if it is live).
- An ad that already ran: no refund, unless the mistake was ours. (This is the rule on the employer terms; confirm it with your accountant.)

## Money and records
- **Payments** tab: tap **Download as spreadsheet** and send it to your accountant every month.
- **Applications** tab: tap the CSV button when you need the list. Applications are deleted automatically after 180 days. If a job seeker asks you to delete their details earlier, search their phone number in the **Applications** tab, then ask your developer to delete it (or, in Supabase > Table Editor > `applications`, delete the row).
- Every approve, reject, hide, show, mark-paid and refund is written in the **admin log** (Supabase > Table Editor > `admin_log`).

## Problems tab
Open **Problems** once a week. It lists crashes the website reported (same crash counted, not repeated). Nothing there is normal; a few lines from old phones are not worrying. If one line keeps growing, send it to your developer. Tap **Clear the list** after you have read it.

## Banned phone numbers
When you **Block** an employer their phone and the WhatsApp numbers of their ads are banned: nobody can post with them, and a new signup with that phone starts blocked. **Unblock** frees the numbers.

## Security habits
- Use a long password nobody else knows, and **turn on two-step login** (Admin > Security). Keep a second admin account.
- Never share the Supabase **service_role** key. Never send passwords on WhatsApp.
- Log out on shared phones.

## If something goes wrong
| What you see | What to do |
|---|---|
| Site says "not ready" or no ads | Check Cloudflare Pages (the last deployment and its settings) and Supabase (not paused). Ask your developer. |
| An employer cannot log in | Tell them to use "Forgot your password?". If no email arrives, check the email sender in Supabase. |
| You lost your phone (two-step login) | Log in with the second admin, then in Supabase > Authentication > Users remove the factor of the first admin. |
| You need an old copy of the data | See "Restore" below. |

## Restore from a backup (ask your developer to do this)
1. Supabase paid plan: Database > Backups > pick a day > Restore. This replaces the data with that day's copy.
2. Weekly file backup: GitHub > Actions > "Weekly database backup" > latest run > download `database-backup`. Decrypt: `gpg --decrypt backup.dump.gpg > backup.dump` (needs the backup passphrase). Restore into a NEW Supabase project with `pg_restore --no-owner -d "<new project connection string>" backup.dump`, then check, then point the website to it.
3. Test a restore once before you need it.
