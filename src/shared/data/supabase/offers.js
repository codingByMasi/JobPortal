// Supabase: prices and offers. The price is always worked out inside the database (quote_price / create_ad_order), never in the browser.
import { toAuditEntry, toOffer, toPackage, toPayment, toQuote, toRedemption } from '../mappers';
import { iso, ok, supabase } from './client';

/** What this employer would pay for a plan, with the best automatic offer or the typed coupon code. */
export async function quotePrice(packageId, couponCode = '') {
  return toQuote(ok(await supabase.rpc('quote_price', { p_package: packageId, p_coupon_code: couponCode.trim() || null })));
}

/** Saves the order (price, offer use, waiting payment). A free total is paid at once and the ad goes to review. */
export async function createAdOrder(jobId, packageId, couponCode = '') {
  return toQuote(ok(await supabase.rpc('create_ad_order', { p_job: jobId, p_package: packageId, p_coupon_code: couponCode.trim() || null })));
}

/* ---------- admin: plans ---------- */
export async function adminSavePackage(pkg) {
  const fields = {
    name: pkg.name.trim(), price_paise: pkg.pricePaise, duration_days: pkg.durationDays, featured: pkg.featured, active: pkg.active,
    description: (pkg.description || '').trim(), badge_text: (pkg.badgeText || '').trim(), max_files: pkg.maxFiles || 1,
  };
  const query = pkg.id ? supabase.from('packages').update(fields).eq('id', pkg.id) : supabase.from('packages').insert(fields);
  return toPackage(ok(await query.select('*').single()));
}

/** Puts the plans in the given order (a list of plan ids, first to last). */
export async function adminReorderPackages(ids) {
  for (const [i, id] of ids.entries()) ok(await supabase.from('packages').update({ sort_order: (i + 1) * 10 }).eq('id', id).select('id').single());
}

/** Deletes a plan that has no ads. The database refuses when ads use it. */
export async function adminDeletePackage(id) {
  ok(await supabase.from('packages').delete().eq('id', id).select('id').single());
}

/** How many ads each plan has (id -> number), to tell which plans can be deleted. */
export async function adminPackageUsage() {
  const rows = ok(await supabase.from('jobs').select('package_id'));
  const out = {};
  for (const r of rows) if (r.package_id) out[r.package_id] = (out[r.package_id] || 0) + 1;
  return out;
}

/* ---------- admin: offers ---------- */
const OFFER_COLUMNS = '*, recruiter:profiles(company_name)';

export async function adminListOffers() {
  const offers = ok(await supabase.from('offers').select(OFFER_COLUMNS).order('created_at', { ascending: false })).map(toOffer);
  const uses = ok(await supabase.from('offer_redemptions').select('offer_id'));
  const count = {};
  for (const u of uses) count[u.offer_id] = (count[u.offer_id] || 0) + 1;
  return offers.map((o) => ({ ...o, uses: count[o.id] || 0 }));
}

export async function adminSaveOffer(offer) {
  const fields = {
    name: offer.name.trim(), type: offer.type, value: offer.type === 'free' ? 0 : offer.value, applies_to: offer.appliesTo,
    package_id: offer.appliesTo === 'package' ? offer.packageId : null,
    recruiter_id: offer.appliesTo === 'recruiter' ? offer.recruiterId : null,
    coupon_code: (offer.couponCode || '').trim() || null,
    starts_at: offer.startsAt ? iso(offer.startsAt) : null, ends_at: offer.endsAt ? iso(offer.endsAt) : null,
    max_uses: offer.maxUses || null, max_uses_per_recruiter: offer.maxUsesPerRecruiter || 1, active: offer.active,
  };
  const query = offer.id ? supabase.from('offers').update(fields).eq('id', offer.id) : supabase.from('offers').insert(fields);
  return toOffer(ok(await query.select(OFFER_COLUMNS).single()));
}

export async function adminSetOfferActive(id, active) {
  ok(await supabase.from('offers').update({ active }).eq('id', id).select('id').single());
}

export async function adminListRedemptions(offerId) {
  return ok(
    await supabase.from('offer_redemptions').select('*, recruiter:profiles(company_name), job:jobs(title)').eq('offer_id', offerId).order('created_at', { ascending: false }),
  ).map(toRedemption);
}

/** Change log of plans and offers, newest first. Filters: table ('packages' | 'offers'), action, from/to (times). */
export async function adminListAudit({ table = '', action = '', from = null, to = null } = {}) {
  let q = supabase.from('audit_log').select('*, admin:profiles(company_name, email)').order('created_at', { ascending: false }).limit(300);
  if (table) q = q.eq('table_name', table);
  if (action) q = q.eq('action', action);
  if (from) q = q.gte('created_at', iso(from));
  if (to) q = q.lt('created_at', iso(to));
  return ok(await q).map(toAuditEntry);
}

/** This month: money taken after discounts, discounts given, top offers by use. */
export async function adminSalesStats() {
  const monthStart = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const paid = ok(await supabase.from('payments').select('amount_paise, discount_paise').eq('status', 'paid').gte('created_at', monthStart));
  const uses = ok(await supabase.from('offer_redemptions').select('offer_id, discount_paise, offer:offers(name)').gte('created_at', monthStart));
  const byOffer = {};
  for (const u of uses) {
    const row = (byOffer[u.offer_id] ||= { offerId: u.offer_id, name: u.offer?.name || '', uses: 0, discountPaise: 0 });
    row.uses += 1;
    row.discountPaise += u.discount_paise;
  }
  return {
    revenuePaise: paid.reduce((s, x) => s + x.amount_paise, 0),
    discountPaise: paid.reduce((s, x) => s + (x.discount_paise || 0), 0),
    topOffers: Object.values(byOffer).sort((a, b) => b.uses - a.uses).slice(0, 5),
  };
}

/* ---------- admin: one ad ---------- */
export async function adminExtendJob(id, days, reason) {
  ok(await supabase.rpc('admin_extend_job', { p_job: id, p_days: days, p_reason: reason.trim() }));
}

export async function adminSetFeatured(id, featured) {
  ok(await supabase.rpc('admin_set_featured', { p_job: id, p_featured: featured }));
}

export async function adminGiveFreeAd(id, note) {
  return toPayment(ok(await supabase.rpc('admin_give_free_ad', { p_job: id, p_note: note.trim() })));
}
