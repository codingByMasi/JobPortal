# 14 - Competitor comparison: deshvideshnaukri.com

Date: 2026-10-07. Research only: no application code was changed. Method and limits are in section 9.

## 1. Short picture

Their site is a **candidate-profile and app** product: candidates register, build a profile and apply **only in an Android app**. Ours is an **ad-board**: no login, the employer's own picture or PDF ad is the listing, and people apply by WhatsApp or a short form. They are strong on structured job data, trust wording, legal pages and technical SEO. We are stronger on reach (works on any phone and any browser), Hindi, security and simplicity. Most of the gap is **content and data fields**, not technology.

## 2. Feature table

"Us" says what exists today in the repository. Items marked *(in progress)* are being built in the current work item and are **not finished yet**.

| Area | Them | Us | Gap | Priority |
|---|---|---|---|---|
| How a candidate applies | Only in the Android app; the website says it takes no applications | No login; WhatsApp button and a short form on every ad | None. This is our advantage | - |
| Languages | English only (selector shows EN) | English and Hindi on every screen | None. Our advantage | - |
| Job listing content | Structured fields (see section 5) | An ad picture/PDF, title, place, company, details text | Structured fields missing *(in progress)* | **High** |
| Salary shown | A range with currency per month, or "not disclosed" | Only inside the ad picture | Same as above *(in progress)* | **High** |
| Filters | Category (10 sector groups), location (15 countries), experience (5 levels), search box, popular-search links | Country (6), kind of work (8), search box | Experience filter; more countries; popular searches *(experience in progress)* | Medium |
| "New" tag, "posted 5 hours ago" | Yes | "Posted today / x days ago"; no New tag | New tag *(in progress)* | Low |
| Pagination | 20 per page, numbered pages | 5 at a time, "show more" | Fine for us; revisit at about 500 live ads | Low |
| Verified employer | Badge on cards and a "Verified employer" box; says every employer passes KYC | Verified badge set only by admin; registration number field | Show the registration number next to the badge *(in progress)* | Medium |
| Fraud message | Large "never pays a fee" block on home, FAQ, terms; fraud report is a subject in the contact form | Notice on the ad page; Report this ad opens WhatsApp | Banner on Home; a real report form saved in the database and reviewed by admin *(in progress)* | **High** |
| Live counters on home | Registered seekers, verified agencies, active jobs, applications (small numbers shown) | None | Counters *(in progress)*; show only when numbers are real | Medium |
| Country pages | /jobs/uae, /jobs/saudi-arabia, /jobs/qatar, /jobs/india, /jobs/bahrain, a short intro and the list in the HTML | Filter buttons only (/jobs?country=uae) | Landing pages with own title and text *(in progress)* | **High** |
| Static pages | About, Contact, FAQ, Privacy, Terms, Refund, Account deletion, Career tips, Blog | Contact, Privacy, Terms | About, FAQ, Refund, Account deletion *(in progress)* | **High** |
| Career tips / Blog | Pages exist but have **no articles** ("will appear here") | None | Do not copy the empty pages (section 7) | Low |
| Employer onboarding | 4 steps, KYC approval first; no price on the page | 3 steps on Post-a-job with the prices; admin approves every ad; offers and coupons | We show prices (better for trust). Consider a short "how we verify" box | Low |
| Pricing | Paid ads, database-search credits and subscriptions exist (from the refund policy) but no amounts are public | Plans and offers built; prices public | None | - |
| Sitemap | 61 URLs: pages, 7 country pages, 43 jobs; lastmod, changefreq and priority on all | Sitemap built at deploy; only pages and jobs; lastmod only | Country and new pages; changefreq not needed | Medium |
| Google job data (JobPosting) | Yes: salary, valid-through, employment type, direct-apply flag; plus Organization, WebSite and app data | JobPosting without salary, employment type or direct-apply | Add salary and employment type once the fields exist | Medium |
| Load on a throttled phone | Performance 86 to 88, first content 1.2 to 1.4 s, biggest content 2.5 to 2.8 s, blocking time 400 ms, about 530 to 570 KB | Performance 96 to 98, biggest content 1.9 to 2.6 s, blocking time 20 to 50 ms, 142 to 253 KB | None. Our advantage | - |
| Accessibility score (Lighthouse) | 85 to 89 | 100 | None. Our advantage | - |
| Contact | Phone with hours (Mon to Sat), email, contact form; no WhatsApp, no address | WhatsApp, email, named complaints person | Opening hours; a postal address once the company has one | Low |
| Save job, similar jobs, applications counter | Yes | No | Nice to have | Low |
| Mobile app | Android app is the main way to apply | None (not needed) | Do not build an app now | - |

## 3. What they do better

1. **Complete, searchable job facts.** Salary range with currency, experience, vacancies, last date, contract length and a short benefits list let a candidate decide without opening a picture.
2. **Trust wording repeated everywhere.** The "no fee ever" promise appears on home, FAQ, terms, privacy and the apply area, with a fraud-report route.
3. **A full set of legal and help pages**, linked in the footer, including account deletion (needed for app-store and data-protection reasons).
4. **Technical SEO.** Pages are rendered on the server, so Google and WhatsApp read the full list and every job; each job has its own title, canonical address, share image and Google job data with salary and deadline; the sitemap carries dates.
5. **Country landing pages** with a short intro written for search words ("jobs in UAE for Indian workers").
6. **Wider sector range** (healthcare, IT, oil and gas, hospitality) and 15 countries, aimed at skilled and professional jobs as well as trades.
7. **Opening hours and a named fraud route** on the contact page.

## 4. What we do better

1. **No app, no login to apply.** Anyone with any phone can apply in seconds; theirs cannot apply on the web at all. For our audience (cheap phones, little storage, low trust in installing apps) this is the biggest difference.
2. **Hindi and English** on every screen; theirs is English only.
3. **The employer's own ad** (picture or PDF) is shown whole, which is how agents in India already advertise. They convert everything into a form.
4. **WhatsApp apply and share**, with the ad code, matching how people actually talk to agents.
5. **Every ad is approved by an admin** before it goes live, with payment checked first; admin accounts have two-step login; database rules protect every table (tested with 344 automated tests).
6. **Speed, weight and accessibility:** about a third of their page weight, near-zero blocking time, accessibility score 100, big text and 52 px buttons.
7. **Public prices, offers and coupons** for employers; theirs hides prices.
8. **Honest numbers:** we plan to show counters only when real, never invented.

## 5. Fields on their job listing that ours lacks

From the job pages I read (field names only; no company or person data kept):

| Their field | Format they use | Ours |
|---|---|---|
| Salary range | currency code, range, per month ("not disclosed" when empty) | missing *(in progress: salary_min, salary_max, currency)* |
| Experience required | levels Fresher, 1-2, 2-5, 5-10, 10+, and a years range on the page | missing *(in progress; we use 4 levels)* |
| Vacancies (position count) | number | missing *(in progress)* |
| Application deadline | "Apply by" date | missing *(in progress: last_date)* |
| Visa or licence requirement | free text (for example a driving licence at least N years old) | missing *(in progress: visa_type, optional)* |
| Employment type | Full time | missing (not in the current request) |
| Contract duration | for example 2 years | missing (not in the current request) |
| Benefits | list: accommodation, food, transport, overtime | missing (can go in the details text for now) |
| Employer verified | badge plus a company box | badge only |
| Applications so far | counter on the page | missing (low value; shows "0" often) |
| Save job / similar jobs | buttons and a list of 4 | missing |

They do **not** show gender, age or nationality limits on the pages I read (good practice; we should not add them either).

## 6. Legal and trust pages we need

Both sides need pages written or reviewed by a professional. What they have and what we should have:

| Page | Them | Us today | What to add |
|---|---|---|---|
| About | mission, "KYC-verified employers", no company details | none | About with the real company name and address once registered |
| Contact | phone hours, email, form with a fraud-report subject | WhatsApp, email, named complaints person | Opening hours |
| FAQ | 6 questions, mostly about fees and fraud | none | 10 to 12 plain questions in English and Hindi |
| Privacy | headings only; no law named; no retention period; no date | draft with retention (180 days) | Name the law (India DPDP Act), keep our retention period, add a last-updated date |
| Terms | candidate and employer duties, "no fees ever", India law and courts, liability limit | draft with employer rules | Add governing law and a dispute route; lawyer review |
| Refund policy | employers only; non-refundable once active; exceptions for gateway errors; 7 days to ask; 5 to 7 business days to refund | rule is in the employer terms | Separate Refund page |
| Account deletion | request through settings or by email; 7 business days; permanent | none | Page with a request form; admin review |
| Grievance officer | none named on the pages I saw | named complaints person on Contact | Keep it (an advantage) |

Everything legal in this list must be confirmed with a lawyer and an accountant (see `docs/11-owner-checklist.md`, section B).

## 7. SEO tactics worth adopting, and mistakes to avoid

**Worth adopting**
1. A page per country with its own title, a two-sentence intro and the real list of ads in the page text, linked from the footer and sitemap.
2. One address per job with its own title ("Job title in City, Country"), a canonical link and a share picture (we already do this at deploy time).
3. Google job data with salary, valid-through and employment type (needs the new fields).
4. Sitemap with dates for every page (they set a date on all 61 addresses).
5. Organization and website data on the home page.
6. Footer links to every country page and every legal page.
7. Popular-search links on the home page (Driver, Electrician, Plumber, Cook) pointing at filtered lists.

**Mistakes of theirs to avoid**
1. **Application only in an app**, stated on every page: it shuts out iPhone and low-storage phones and costs applications.
2. **Empty Career Tips and Blog pages** that are public and say "will appear here": thin pages that look unfinished. Publish only when there are real articles.
3. **A typing slip in robots.txt**: the sitemap address has a double slash after the domain. Check ours after build.
4. **Page that overflows to the side on a phone-sized window** was seen in one reading (the page width came out wider than the window), but I could not repeat it reliably in the browser pane, so this is NOT VERIFIED.
5. **Counters with very small numbers** (96 seekers, 79 applications) on the home page can hurt trust; show counters only above a sensible number or hide the weakest one.
6. **Privacy policy without a date, a named law or a retention period**, and no named grievance officer.
7. **Small tap targets and 400 ms blocking time** on a throttled phone: avoid heavy scripts on the public pages.

## 8. The 10 things to add to our app, in order

| # | What | Why | Effort |
|---|---|---|---|
| 1 | Structured job fields: salary range with currency, experience, vacancies, last date, visa/licence text, in the form, card, detail page and public list | Candidates decide faster; needed for Google job data; their biggest advantage | M *(in progress)* |
| 2 | Fraud banner on Home and the ad page, and a real Report form saved in the database with an admin screen | Our audience fears fake agents; their strongest message | M *(in progress)* |
| 3 | Country landing pages (/jobs/uae and so on) with own title, intro and ad list, in the sitemap | Search traffic for "jobs in Dubai" type words | M *(in progress)* |
| 4 | About, FAQ, Refund and Account-deletion pages in English and Hindi (draft text for a professional) | Trust, and needed to take payments or ads from agencies | M *(in progress)* |
| 5 | Google job data with salary, valid-through and employment type; sitemap with dates; check robots.txt after build | Better search results and WhatsApp/Google previews | S |
| 6 | Experience filter and "New" tag; popular-search links on Home | Faster finding; matches how they filter | S *(in progress)* |
| 7 | Home counters (live ads, verified employers, applications) shown only when real and above a small number | Social proof without false claims | S *(in progress)* |
| 8 | Show the employer registration number beside the Verified badge | Lets a candidate check the agency with the Ministry list | S *(in progress)* |
| 9 | More countries and sector groups (Bahrain, Malaysia; healthcare, hotel, oil and gas) chosen with the owner | Their range is wider; only add if you want to serve those jobs | M |
| 10 | Opening hours on Contact, a "how we verify employers" box on Post-a-job, benefits and contract length as optional fields, "similar ads" on the ad page | Smaller trust and decision helpers | S to M |

Not recommended: a mobile app, blogs without writers, copying their categories wholesale.

## 9. Method, limits and what I could not see

- **Pages read (public only, one request at a time, 22 pages, under the 40 limit):** robots.txt, sitemap.xml, home, all-jobs, one country page (UAE), three job pages (the third was read for field names only), for-employers, about, contact, FAQ, privacy, terms, refund, account-deletion, career-tips, blog, plus two throttled phone speed tests (home and the UAE page) and two page loads in a browser to read page data. robots.txt allows these pages.
- No login, no account, no form submitted, no message sent. No candidate or recruiter details were stored; company names and phone numbers from job pages are not in this file.
- Text and design were not copied; everything above is paraphrased.
- **NOT VERIFIED:** their India and Gulf jobs pages and the Bahrain page (only seen in menus); the mobile layout at 390 px (the browser pane did not apply the narrow window to this site; only Lighthouse phone figures are reliable); tap-target sizes; how the site behaves offline or on a real slow network; whether their Android app works well; their employer pricing; any content behind login; whether the counters are accurate.
- Speed figures are single runs of Lighthouse with simulated slow phone settings from this computer. They vary from run to run and should be read as rough.
- Page findings come from an automatic summary of each page and can miss details; the structured data and robots.txt points were read directly.
