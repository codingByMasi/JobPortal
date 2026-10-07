// The price rules in plain JavaScript. The REAL price is always worked out by the database (quote_price); this copy only runs in demo mode and in tests.
// It must give the same answers as the SQL (scripts/rls.offers.test.mjs checks the database, pricing.test.js checks this copy).

/** Money worth of an offer, used to pick the best automatic one (bonus days are worth the daily price of the plan). */
function worth(offer, listPaise, days) {
  if (offer.type === 'percent') return (listPaise * offer.value) / 100;
  if (offer.type === 'flat') return Math.min(offer.value, listPaise);
  if (offer.type === 'free') return listPaise;
  return (listPaise / days) * offer.value;
}

/** What is wrong with an offer for this plan and employer ('' when it works). */
function problemWith(offer, { packageId, recruiterId, now, usesTotal, usesMine }) {
  if (!offer) return 'not_found';
  if (!offer.active) return 'inactive';
  if (offer.startsAt && offer.startsAt > now) return 'not_started';
  if (offer.endsAt && offer.endsAt <= now) return 'expired';
  if (offer.appliesTo === 'package' && offer.packageId !== packageId) return 'wrong_plan';
  if (offer.appliesTo === 'recruiter' && offer.recruiterId !== recruiterId) return 'wrong_recruiter';
  if (offer.maxUses != null && usesTotal >= offer.maxUses) return 'used_up';
  if (usesMine >= offer.maxUsesPerRecruiter) return 'already_used';
  return '';
}

/**
 * `pkg` the plan, `offers` all offers, `redemptions` [{ offerId, recruiterId }] already used, `code` what the employer typed.
 * One offer at most (never stacked). The final price is never below 0.
 */
export function computeQuote({ pkg, offers, redemptions = [], recruiterId, code = '', now = Date.now() }) {
  if (!pkg || pkg.active === false) return { ok: false, code: 'plan_unavailable' };
  const list = pkg.pricePaise;
  const base = pkg.durationDays;
  const check = (o) => problemWith(o, {
    packageId: pkg.id, recruiterId, now,
    usesTotal: redemptions.filter((r) => r.offerId === o?.id).length,
    usesMine: redemptions.filter((r) => r.offerId === o?.id && r.recruiterId === recruiterId).length,
  });
  const typed = String(code || '').trim();
  let best = null;
  if (typed) {
    const found = offers.find((o) => o.couponCode && o.couponCode.toLowerCase() === typed.toLowerCase());
    const problem = found ? check(found) : 'not_found';
    if (problem) return { ok: false, code: problem, listPricePaise: list, discountPaise: 0, finalPricePaise: list, bonusDays: 0, baseDays: base, finalDays: base };
    best = found;
  } else {
    let bestWorth = -1;
    for (const o of offers) {
      if (o.couponCode || check(o)) continue;
      const w = worth(o, list, base);
      if (w > bestWorth) { bestWorth = w; best = o; }
    }
  }
  let discount = 0;
  let bonus = 0;
  if (best) {
    if (best.type === 'percent') discount = Math.round((list * best.value) / 100);
    else if (best.type === 'flat') discount = Math.min(best.value, list);
    else if (best.type === 'free') discount = list;
    else bonus = best.value;
  }
  discount = Math.min(Math.max(discount, 0), list);
  return {
    ok: true, code: best ? best.type : 'no_offer',
    listPricePaise: list, discountPaise: discount, finalPricePaise: Math.max(list - discount, 0),
    bonusDays: bonus, baseDays: base, finalDays: base + bonus,
    offerId: best?.id ?? null, offerName: best?.name ?? '', offerType: best?.type ?? '', offerValue: best?.value ?? 0, viaCode: Boolean(typed && best),
    percent: best?.type === 'percent' ? best.value : null,
  };
}

/** active / scheduled / expired / usedUp / off, for the admin list. `uses` is how many times the offer was used. */
export function offerStatus(offer, uses = 0, now = Date.now()) {
  if (!offer.active) return 'off';
  if (offer.endsAt && offer.endsAt <= now) return 'expired';
  if (offer.maxUses != null && uses >= offer.maxUses) return 'usedUp';
  if (offer.startsAt && offer.startsAt > now) return 'scheduled';
  return 'active';
}
