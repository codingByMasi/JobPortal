// Demo: prices and offers. Follows the same rules as the database (pricing.js is a copy of quote_price) so every screen can be tried without Supabase.
import { computeQuote } from '../../lib/pricing';
import { toAuditEntry, toOffer, toPackage, toPayment, toQuote, toRedemption } from '../mappers';
import { fail, findJob, logAdmin, me, needAdmin, needUser, newest, pkgOf, profileOf, save, state, uid, wait } from './store';

const offerRows = () => (state.db.offers ||= []);
const redemptionRows = () => (state.db.offer_redemptions ||= []);
const auditRows = () => (state.db.audit_log ||= []);
const nowIso = () => new Date().toISOString();

/** The audit log line the real database writes with a trigger. */
function audit(action, table, before, after) {
  const admin = me();
  auditRows().push({ id: uid(), admin_id: admin?.id ?? null, admin: admin ? { company_name: admin.company_name, email: admin.email } : null, action, table_name: table, record_id: (after || before).id, old_value: before ? { ...before } : null, new_value: after ? { ...after } : null, created_at: nowIso() });
}

const quoteFor = (recruiterId, packageId, code) => computeQuote({
  pkg: toPackage(pkgOf(packageId)),
  offers: offerRows().map(toOffer),
  redemptions: redemptionRows().map((r) => ({ offerId: r.offer_id, recruiterId: r.recruiter_id })),
  recruiterId, code,
});

export async function quotePrice(packageId, couponCode = '') {
  await wait();
  const p = needUser();
  return toQuote(quoteFor(p.id, packageId, couponCode));
}

export async function createAdOrder(jobId, packageId, couponCode = '') {
  await wait();
  const p = needUser();
  if (p.blocked) throw fail('BLOCKED');
  const job = findJob(jobId);
  if (job.recruiter_id !== p.id) throw fail('NOT_FOUND');
  if (job.status !== 'pending_payment') throw fail('NOT_WAITING', 'This ad is not waiting for payment.');
  state.db.offer_redemptions = redemptionRows().filter((r) => r.job_id !== jobId); // ordering again gives the earlier use back first
  const q = quoteFor(p.id, packageId, couponCode);
  if (!q.ok) throw fail('OFFER', `offer: ${q.code}`);
  Object.assign(job, {
    package_id: packageId, list_price_paise: q.listPricePaise, discount_paise: q.discountPaise, final_price_paise: q.finalPricePaise,
    offer_id: q.offerId, duration_days_final: q.finalDays, price_paise_at_order: q.finalPricePaise, days_at_order: q.finalDays,
  });
  let pay = state.db.payments.find((x) => x.job_id === jobId && x.status === 'created');
  const snapshot = { amount_paise: q.finalPricePaise, list_price_paise: q.listPricePaise, discount_paise: q.discountPaise, final_price_paise: q.finalPricePaise, offer_id: q.offerId, duration_days_final: q.finalDays };
  if (pay) Object.assign(pay, snapshot);
  else state.db.payments.push((pay = { id: uid(), job_id: jobId, recruiter_id: p.id, currency: 'INR', method: 'manual', status: 'created', note: '', reference: null, created_at: nowIso(), ...snapshot }));
  if (q.offerId) redemptionRows().push({ id: uid(), offer_id: q.offerId, recruiter_id: p.id, job_id: jobId, discount_paise: q.discountPaise, bonus_days: q.bonusDays, created_at: nowIso() });
  let jobStatus = 'pending_payment';
  if (q.finalPricePaise === 0) {
    Object.assign(pay, { status: 'paid', method: 'free_offer', note: `Free offer: ${q.offerName}`.slice(0, 200) });
    job.status = 'paid_pending_review';
    jobStatus = 'paid_pending_review';
  }
  save();
  return toQuote({ ...q, jobStatus });
}

/* ---------- admin: plans ---------- */
export async function adminSavePackage(pkg) {
  await wait();
  needAdmin();
  const fields = {
    name: pkg.name.trim(), price_paise: pkg.pricePaise, duration_days: pkg.durationDays, featured: pkg.featured, active: pkg.active,
    description: (pkg.description || '').trim(), badge_text: (pkg.badgeText || '').trim(), max_files: pkg.maxFiles || 1,
  };
  const row = pkg.id && state.db.packages.find((x) => x.id === pkg.id);
  if (row) {
    const before = { ...row };
    Object.assign(row, fields);
    audit('update', 'packages', before, row);
  } else {
    const next = { id: uid(), sort_order: Math.max(0, ...state.db.packages.map((x) => x.sort_order || 0)) + 10, ...fields };
    state.db.packages.push(next);
    audit('insert', 'packages', null, next);
  }
  save();
  return toPackage(row || state.db.packages.at(-1));
}

export async function adminReorderPackages(ids) {
  await wait();
  needAdmin();
  ids.forEach((id, i) => {
    const row = pkgOf(id);
    if (row) row.sort_order = (i + 1) * 10;
  });
  save();
}

export async function adminDeletePackage(id) {
  await wait();
  needAdmin();
  const row = pkgOf(id);
  if (!row) throw fail('NOT_FOUND');
  if (state.db.jobs.some((j) => j.package_id === id)) throw fail('PLAN_HAS_ADS', 'This plan has ads. Turn it off instead.');
  state.db.packages = state.db.packages.filter((x) => x.id !== id);
  audit('delete', 'packages', row, null);
  save();
}

export async function adminPackageUsage() {
  await wait();
  needAdmin();
  const out = {};
  for (const j of state.db.jobs) if (j.package_id) out[j.package_id] = (out[j.package_id] || 0) + 1;
  return out;
}

/* ---------- admin: offers ---------- */
const withName = (o) => ({ ...o, recruiter: o.recruiter_id ? profileOf(o.recruiter_id) : null });

export async function adminListOffers() {
  await wait();
  needAdmin();
  return [...offerRows()].sort(newest).map((o) => ({ ...toOffer(withName(o)), uses: redemptionRows().filter((r) => r.offer_id === o.id).length }));
}

export async function adminSaveOffer(offer) {
  await wait();
  needAdmin();
  const code = (offer.couponCode || '').trim() || null;
  if (code && offerRows().some((o) => o.id !== offer.id && (o.coupon_code || '').toLowerCase() === code.toLowerCase())) throw fail('CODE_TAKEN', 'offers_coupon_unique');
  const fields = {
    name: offer.name.trim(), type: offer.type, value: offer.type === 'free' ? 0 : offer.value, applies_to: offer.appliesTo,
    package_id: offer.appliesTo === 'package' ? offer.packageId : null, recruiter_id: offer.appliesTo === 'recruiter' ? offer.recruiterId : null,
    coupon_code: code, starts_at: offer.startsAt ? new Date(offer.startsAt).toISOString() : null, ends_at: offer.endsAt ? new Date(offer.endsAt).toISOString() : null,
    max_uses: offer.maxUses || null, max_uses_per_recruiter: offer.maxUsesPerRecruiter || 1, active: offer.active,
  };
  const row = offer.id && offerRows().find((o) => o.id === offer.id);
  if (row) {
    const before = { ...row };
    Object.assign(row, fields);
    audit('update', 'offers', before, row);
    save();
    return toOffer(withName(row));
  }
  const next = { id: uid(), created_at: nowIso(), ...fields };
  offerRows().push(next);
  audit('insert', 'offers', null, next);
  save();
  return toOffer(withName(next));
}

export async function adminSetOfferActive(id, active) {
  await wait();
  needAdmin();
  const row = offerRows().find((o) => o.id === id);
  if (!row) throw fail('NOT_FOUND');
  const before = { ...row };
  row.active = active;
  audit('update', 'offers', before, row);
  save();
}

export async function adminListRedemptions(offerId) {
  await wait();
  needAdmin();
  return redemptionRows().filter((r) => r.offer_id === offerId).sort(newest)
    .map((r) => toRedemption({ ...r, recruiter: profileOf(r.recruiter_id), job: state.db.jobs.find((j) => j.id === r.job_id) }));
}

export async function adminListAudit({ table = '', action = '', from = null, to = null } = {}) {
  await wait();
  needAdmin();
  return auditRows()
    .filter((a) => (!table || a.table_name === table) && (!action || a.action === action)
      && (!from || Date.parse(a.created_at) >= from) && (!to || Date.parse(a.created_at) < to))
    .sort(newest).slice(0, 300).map(toAuditEntry);
}

export async function adminSalesStats() {
  await wait();
  needAdmin();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const paid = state.db.payments.filter((x) => x.status === 'paid' && Date.parse(x.created_at) >= monthStart);
  const byOffer = {};
  for (const r of redemptionRows().filter((x) => Date.parse(x.created_at) >= monthStart)) {
    const row = (byOffer[r.offer_id] ||= { offerId: r.offer_id, name: offerRows().find((o) => o.id === r.offer_id)?.name || '', uses: 0, discountPaise: 0 });
    row.uses += 1;
    row.discountPaise += r.discount_paise;
  }
  return {
    revenuePaise: paid.reduce((s, x) => s + x.amount_paise, 0),
    discountPaise: paid.reduce((s, x) => s + (x.discount_paise || 0), 0),
    topOffers: Object.values(byOffer).sort((a, b) => b.uses - a.uses).slice(0, 5),
  };
}

/* ---------- admin: one ad ---------- */
export async function adminExtendJob(id, days, reason) {
  await wait();
  needAdmin();
  const row = findJob(id);
  if (!(days >= 1 && days <= 365)) throw fail('NOT_ALLOWED');
  if (reason.trim().length < 3) throw fail('NEED_MESSAGE');
  if (!['live', 'hidden'].includes(row.status) || !row.expires_at) throw fail('NOT_NOW', 'Only a live ad can get more days.');
  row.expires_at = new Date(Math.max(Date.parse(row.expires_at), Date.now()) + days * 86400000).toISOString();
  logAdmin('extend_job', id, `+${days} days: ${reason.trim().slice(0, 200)}`);
  save();
}

export async function adminSetFeatured(id, featured) {
  await wait();
  needAdmin();
  findJob(id).featured_override = featured;
  logAdmin('set_featured', id, String(featured));
  save();
}

export async function adminGiveFreeAd(id, note) {
  await wait();
  needAdmin();
  const row = findJob(id);
  const text = note.trim().slice(0, 200);
  if (text.length < 3) throw fail('NEED_MESSAGE');
  if (row.status !== 'pending_payment') throw fail('NOT_WAITING', 'This ad is not waiting for payment.');
  let pay = state.db.payments.find((x) => x.job_id === id && x.status === 'created');
  const free = { status: 'paid', method: 'complimentary', amount_paise: 0, final_price_paise: 0, note: text };
  if (pay) Object.assign(pay, free, { discount_paise: pay.list_price_paise || 0 });
  else state.db.payments.push((pay = { id: uid(), job_id: id, recruiter_id: row.recruiter_id, currency: 'INR', reference: null, created_at: nowIso(), list_price_paise: row.list_price_paise ?? null, discount_paise: row.list_price_paise || 0, ...free }));
  Object.assign(row, { status: 'paid_pending_review', discount_paise: row.list_price_paise || 0, final_price_paise: 0 });
  logAdmin('give_free_ad', id, text);
  save();
  return toPayment(pay);
}
