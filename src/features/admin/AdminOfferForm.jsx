// The create / edit form of one offer, in a pop-up, with a plain-words example of what it does.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Field from '../../shared/ui/Field';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { toDateString } from '../../shared/data/mappers';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';
import { paiseToRupees, rupeesToPaise } from '../../shared/lib/money';
import { generateCode, offerPreview } from './offerPreview';

const startOfDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0).getTime(); };
const endOfDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 0).getTime(); };

/** `offer` is a saved offer (edit), a copy without id (duplicate) or a start such as { appliesTo: 'recruiter', recruiterId } (new). */
export default function AdminOfferForm({ offer, packages, employers, onClose, onSaved }) {
  const { t } = useLang();
  const o = offer || {};
  const [v, setV] = useState({
    name: o.name || '',
    type: o.type || 'percent',
    value: o.type === 'flat' ? paiseToRupees(o.value) : o.value ? String(o.value) : '',
    appliesTo: o.appliesTo || 'all',
    packageId: o.packageId || packages.find((p) => p.active)?.id || '',
    recruiterId: o.recruiterId || '',
    couponCode: o.couponCode || '',
    starts: o.startsAt ? toDateString(o.startsAt) : '',
    ends: o.endsAt ? toDateString(o.endsAt) : '',
    maxUses: o.maxUses ? String(o.maxUses) : '',
    perEmployer: String(o.maxUsesPerRecruiter || 1),
    active: o.active ?? true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setV({ ...v, [key]: e.target.value });

  const number = v.type === 'flat' ? rupeesToPaise(v.value) : Number(v.value);
  const employerName = employers.find((x) => x.id === v.recruiterId)?.companyName || '';
  const preview = offerPreview({ type: v.type, value: number, appliesTo: v.appliesTo, packageId: v.packageId }, packages, employerName, t);

  const save = async (e) => {
    e.preventDefault();
    const next = {};
    if (!v.name.trim()) next.name = t.errRequired;
    if (v.type === 'percent' && !(Number.isInteger(number) && number >= 1 && number <= 100)) next.value = t.errPercent;
    if (v.type === 'flat' && !(number >= 100)) next.value = t.errPrice;
    if (v.type === 'bonus_days' && !(Number.isInteger(number) && number >= 1 && number <= 365)) next.value = t.errRequired;
    if (v.appliesTo === 'package' && !v.packageId) next.packageId = t.errRequired;
    if (v.appliesTo === 'recruiter' && !v.recruiterId) next.recruiterId = t.errRequired;
    if (v.couponCode.trim() && !/^[A-Za-z0-9_-]{3,30}$/.test(v.couponCode.trim())) next.couponCode = t.errCouponShape;
    if (v.starts && v.ends && endOfDay(v.ends) <= startOfDay(v.starts)) next.ends = t.errEndsBeforeStart;
    if (v.maxUses && !(Number.isInteger(+v.maxUses) && +v.maxUses >= 1)) next.maxUses = t.errRequired;
    if (!(Number.isInteger(+v.perEmployer) && +v.perEmployer >= 1)) next.perEmployer = t.errRequired;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.adminSaveOffer({
        id: o.id, name: v.name, type: v.type, value: v.type === 'free' ? 0 : number, appliesTo: v.appliesTo, packageId: v.packageId, recruiterId: v.recruiterId,
        couponCode: v.couponCode, startsAt: v.starts ? startOfDay(v.starts) : null, endsAt: v.ends ? endOfDay(v.ends) : null,
        maxUses: v.maxUses ? Number(v.maxUses) : null, maxUsesPerRecruiter: Number(v.perEmployer), active: v.active,
      });
      onSaved();
    } catch (err) {
      setFormError(friendlyMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <Modal title={o.id ? t.offerEditTitle : t.offerNewTitle} onClose={onClose} wide>
      <form className="form" onSubmit={save} noValidate>
        <Field label={t.offerName} help={t.offerNameHelp} error={errors.name}>
          <input type="text" value={v.name} onChange={set('name')} maxLength={80} />
        </Field>
        <Field label={t.offerType}>
          <select value={v.type} onChange={set('type')}>
            <option value="percent">{t.offerTypePercent}</option>
            <option value="flat">{t.offerTypeFlat}</option>
            <option value="bonus_days">{t.offerTypeBonus}</option>
            <option value="free">{t.offerTypeFree}</option>
          </select>
        </Field>
        {v.type !== 'free' && (
          <Field label={{ percent: t.offerValuePercent, flat: t.offerValueRupees, bonus_days: t.offerValueDays }[v.type]} error={errors.value}>
            <input type="text" inputMode="decimal" value={v.value} onChange={set('value')} />
          </Field>
        )}
        <Field label={t.offerAppliesTo}>
          <select value={v.appliesTo} onChange={set('appliesTo')}>
            <option value="all">{t.offerAll}</option>
            <option value="package">{t.offerPackage}</option>
            <option value="recruiter">{t.offerRecruiter}</option>
          </select>
        </Field>
        {v.appliesTo === 'package' && (
          <Field label={t.offerPlan} error={errors.packageId}>
            <select value={v.packageId} onChange={set('packageId')}>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {v.appliesTo === 'recruiter' && (
          <Field label={t.offerEmployer} error={errors.recruiterId}>
            <select value={v.recruiterId} onChange={set('recruiterId')}>
              <option value="">{t.offerChooseEmployer}</option>
              {employers.map((x) => <option key={x.id} value={x.id}>{x.companyName || x.email}</option>)}
            </select>
          </Field>
        )}
        <Field label={t.offerCoupon} help={t.offerCouponHelp} error={errors.couponCode}>
          <input type="text" value={v.couponCode} onChange={set('couponCode')} maxLength={30} autoCapitalize="characters" />
        </Field>
        <div className="actions"><Button size="sm" tone="outline" icon="refresh" onClick={() => setV({ ...v, couponCode: generateCode() })}>{t.offerGenerate}</Button></div>
        <div className="field-row">
          <Field label={t.offerStarts}><input type="date" value={v.starts} onChange={set('starts')} /></Field>
          <Field label={t.offerEnds} error={errors.ends}><input type="date" value={v.ends} onChange={set('ends')} /></Field>
        </div>
        <div className="field-row">
          <Field label={t.offerMaxUses} help={t.offerMaxUsesHelp} error={errors.maxUses}>
            <input type="number" inputMode="numeric" min="1" value={v.maxUses} onChange={set('maxUses')} />
          </Field>
          <Field label={t.offerMaxPer} error={errors.perEmployer}>
            <input type="number" inputMode="numeric" min="1" value={v.perEmployer} onChange={set('perEmployer')} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          <span>{t.offerActiveLabel}</span>
        </label>
        {preview && <Notice tone="info">{t.offerExample}: {preview}</Notice>}
        <Notice tone="error">{formError}</Notice>
        <Button type="submit" icon="check" disabled={busy}>{busy ? t.saving : t.save}</Button>
      </form>
    </Modal>
  );
}
