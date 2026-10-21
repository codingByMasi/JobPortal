# 10 - Admin guide (plain words)

For the person who runs the site every day. No technical knowledge needed. Use the **Admin** tabs: Dashboard, All ads, Employers, Payments, Packages, Offers (the last three are not used for employers any more, see "Old payment tools"), Applications, Change requests, Guides, Settings, Security, Reports, History, Problems. A short description of every feature is in the **Guides** tab ("What the app does"). The guides are saved in the database and **only admins can read them** (Admin > Guides); the employer and job seeker guides are there too, with a **Copy the text** button so you can send them on WhatsApp.

## First day as admin (do once)
1. Log in. Open **Security** and turn on two-step login (scan the QR code with an authenticator app, type the code). Save the app's recovery option.
2. Open **Settings** and fill in the WhatsApp number, emails, complaints person, company name and site address.
3. Make a second admin (below) and have them turn on two-step login too.

## Making someone an admin
An admin can do everything, including approving ads and verifying employers, so give it to as few people as possible (two or three) and only to people you trust. Each admin must turn on two-step login.
1. The person signs up on the site like an employer and confirms their email.
2. **On the computer with the project** (Supabase already linked): open a terminal in the project folder and run
   `node scripts/make-admin.mjs person@example.com`
   It refuses if the person has no account, has not confirmed their email, or is blocked. It writes a line in the admin log.
3. The person logs out and in again, and opens **Admin > Security** to turn on two-step login.
- **See everyone:** `node scripts/make-admin.mjs --list`
- **Take admin away:** `node scripts/make-admin.mjs person@example.com --remove` (they become a normal employer again).
- **Without the computer:** Supabase dashboard > Table Editor > `profiles` > find the row (the email is in Authentication > Users; match by the id) > change `role` from `recruiter` to `admin` > Save. To remove, change it back.
- When someone leaves the team, remove their admin role the same day.

## Updating the guides
The guides are written in `docs/10-admin-guide.md`, `16-employer-guide.md`, `17-job-seeker-guide.md` and `18-app-features.md`. After you change one, run `npm run guides:publish` on the computer with the project: it saves the new text in the database for Admin > Guides.

## Every day (about 15 minutes)
1. **Dashboard ("What needs you today")**: six cards. A card with a thick border has work for you. Tap it to open exactly that list:
   - **Licenses to check**: employers who sent a license (see "Verify an employer" below).
   - **Waiting for approval**: ads to read and approve (choose the days).
   - **Ending in 3 days**: live ads that will stop showing soon, soonest first. If the employer wants to continue, tap **More days**. Tap **WhatsApp them** to ask first.
   - **Change requests**: an employer asked for a change, or for **more days** (the message says so). For more days, open the ad in the Ads tab and tap **More days**.
   - **Ended in the last 30 days**: ads that already stopped. **More days** puts one back live for the new days counted from today.
   - **Live ads**: how many are showing now.
2. **Licenses to check** (Employers tab): an employer who sent a license shows **License sent: check it**. See "Verify an employer" below.
3. **Approve ads** (status "Waiting for approval"). Employers post for free, so there is nothing to pay or to mark as paid:
   - Tap **View ad** and read the whole ad. Reject if it asks job seekers for money (visa fee, registration fee, "security deposit"), has no company or contact, looks fake, or shows a personal document.
   - If the row says **"First ad of this employer"**: call or WhatsApp the employer's number first. Ask who they are and for the registration number if they are a recruitment agent. Check the number on `emigrate.gov.in` (after your lawyer tells you exactly what to check).
   - If the row says **"N other ads use the same WhatsApp number"**: look at those ads. One number behind many companies is a warning sign.
   - Good ad: tap **Approve** and **choose how many days** it stays live (1 to 365; 30 is filled in). The ad goes live at once and ends after those days. Bad ad: **Reject** and write a short reason the employer can understand ("Please add a phone number"). They can fix the ad and send it again.
   - **When the days end** the ad stops showing by itself. To show it again, tap **More days** on that ad (it works on ended ads too), write a reason, and it goes live again for the new days counted from today.
4. **Change requests**: employers cannot edit a paid ad; they ask you. Tap **Open the ad to edit**, make the change, come back and tap **Mark done** (or **Decline** if you cannot). Tap **WhatsApp them** to tell them.
5. **Employers**: verify only after you checked the license (see below). Tap **Block** for a bad employer: all their live ads are hidden at once.

## Faster work
- **Ready-made reasons:** when you reject an ad or a license, tap one of the reasons to fill the box, then change the words if you like. The employer reads what you send.
- **Approve many ads:** on the **Ads** tab choose the status **Waiting for approval**. Tick the ads you have read (or **Select all**), tap **Approve selected**, choose the days, confirm. Read the ads first: it does not ask again for each one.
- **Tell the employer:** after an approve, reject, more days or verify, tap **Tell the employer on WhatsApp**. If emails are set up (`20-notifications.md`) the employer also gets an email by itself.
- **Pictures of deleted ads** are removed from storage quietly when you open the admin area.

## Verify an employer: check the license
Only a **verified** employer can post ads, and you cannot verify an employer who has not sent a license.
1. **Employers** tab: find the row that says **License sent: check it**. Tap **Check license**.
2. You see the license number, the date and the company. Tap **Open license file** to see the picture or PDF (a private link that works for 5 minutes).
3. Check that: the license is real (for a recruitment agent: check the number on the government list, `emigrate.gov.in`, after your lawyer tells you exactly what to check); it is in the same name as the company; it has not expired; the phone and WhatsApp number work (call them); there are no complaints.
4. Good: tap **Verify this employer**. Not good: tap **License not accepted**, write the reason (the employer reads it) and tap **Reject license**. They can send a new one.
When you verify an employer, their **company name and registration number appear on the public Verified agencies page** (with the number of their live ads; never a phone or email). So check that the company name is the real, correct one before you verify. Only after a **verified** tick can they post ads, and see applicants' names and phone numbers. Changing the company name or registration number removes the tick, and you check again (their old license is still on file: look at it and verify again if it is fine).

## Reports and complaints
Job seekers can press **Report this ad**; it opens WhatsApp with the ad code. Open the ad (search the code). If it is bad: **Hide** it, then **Block** the employer if needed, then **Refund** if the money was taken by mistake. Answer the person who reported within 2 days (this is the promise on the Contact page).

## Old payment tools (not used for employers)
Employers post for free, so the **Payments**, **Packages** and **Offers** tabs, **Mark as paid**, **Free ad** and **Refund** are no longer part of the daily work. They stay only for ads made before posting became free and for your records. Each new ad is stored with the first active plan, price 0, and you choose the real days when you approve it.

## Settings tab (your shop details)
- Fill in once, change any time: WhatsApp number, contact email, complaints person and email, company name and site address (the UPI boxes are not needed any more). No developer, no new release.
- Every change is saved in the admin log (Supabase > `admin_log`) with the old and the new value.
- If something is empty the site hides it (for example no WhatsApp button). The home tab shows a red reminder until everything is filled in.
- The site address is used for the search pages and sitemap the next time the site is built (up to 3 hours, or press the deploy hook).

## Activity tab (what the admins did)
Open **Activity** to see every approval, rejection, extra days, hide or show, payment, refund and settings change, newest first, with who did it and a link to the ad. Use the **What** filter to see one kind. It is only for reading: nothing can be changed or deleted here. Use it when two admins work together, or to find out who did something.

## Reports and deletion requests (Reports tab)
- **Reports about ads:** a visitor tapped "Report this ad". Open reports and account deletion requests also show as cards on the dashboard ("Reports to check", "Account deletions"), so you do not have to remember to look. Read the reason and message. When one ad has several open reports, the row says so ("3 open reports on this ad"). Tap *Find the ad* to open it in the Ads tab. If the ad looks fake or asks for money: tap *Hide the ad and close the report* (one tap: the ad goes off the site and the report is closed), then block the employer in the Employers tab if needed. If the report is wrong or silly, tap *Dismiss*. Do this daily at the start; reports about money demands first.
- **Account deletion requests:** anyone can send one with any email, so **never delete only because of a request**. Write to that email first and ask the owner to confirm (or confirm from the phone number on the account). Then ask your developer to delete the account (or in Supabase delete the employer's user), and tap *Mark done*. Payment records stay (the law may need them).
- Employers' **registration number** shows to visitors only when you have tapped *Verify* in the Employers tab. Check the number first (the government list of registered agents) before you verify.

## Money and records
- **Payments** tab: records of older payments; **Download as spreadsheet** if your accountant needs them.
- **Applications** tab: tap the CSV button when you need the list. Applications are deleted automatically after 180 days. If a job seeker asks you to delete their details earlier, search their phone number in the **Applications** tab, then ask your developer to delete it (or, in Supabase > Table Editor > `applications`, delete the row).
- Every approve (with its days), reject, hide, show, extend, verify and license decision is written in the **admin log** (Supabase > Table Editor > `admin_log`).

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
