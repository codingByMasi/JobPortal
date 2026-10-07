// The plain-words example shown while an admin fills in an offer ("20% off the 30 Days plan: ₹1,000 becomes ₹800").
import { computeQuote } from '../../shared/lib/pricing';
import { formatPrice } from '../../shared/lib/money';

/** `draft` has type, value (percent / paise / days), appliesTo, packageId. Returns text, or '' while the form is not ready. */
export function offerPreview(draft, packages, employerName, t) {
  const plans = packages.filter((p) => p.active);
  const plan = (draft.appliesTo === 'package' && packages.find((p) => p.id === draft.packageId)) || plans[0];
  if (!plan || (draft.type !== 'free' && !(draft.value > 0))) return '';
  const offer = { id: 'preview', name: '', active: true, appliesTo: 'all', couponCode: null, startsAt: null, endsAt: null, maxUses: null, maxUsesPerRecruiter: 1, type: draft.type, value: draft.value };
  const q = computeQuote({ pkg: plan, offers: [offer], recruiterId: 'preview' });
  if (!q.ok) return '';
  return t.offerPreview({
    type: draft.type,
    value: draft.type === 'flat' ? formatPrice(draft.value) : draft.value,
    target: draft.appliesTo === 'package' ? 'plan' : 'all',
    planName: plan.name,
    employerName: draft.appliesTo === 'recruiter' ? employerName : '',
    list: formatPrice(q.listPricePaise),
    final: formatPrice(q.finalPricePaise),
    days: q.baseDays,
    finalDays: q.finalDays,
  });
}

/** A random, easy code like "SAVE-K7M2Q" (no 0/O/1/I to avoid mistakes when typing). */
export function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `SAVE-${[...bytes].map((b) => letters[b % letters.length]).join('')}`;
}
