// "Have a coupon code?" - a box and an Apply button. The code is checked by the database; the answer is shown in plain words.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import { api } from '../../shared/data';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { useLang } from '../../shared/i18n/LangContext';

/** `packageId` is the chosen plan; `applied` the code in use; `onApply(code)` is called with '' to remove it. */
export default function CouponBox({ packageId, applied, onApply }) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setError('');
    if (!packageId) return setError(t.couponChoosePlan);
    setBusy(true);
    try {
      const q = await api.quotePrice(packageId, text);
      if (q.ok) {
        onApply(text.trim());
        setText('');
      } else setError(t[`offer_${q.code}`] || t.errGeneric);
    } catch (err) {
      setError(friendlyMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <div className="coupon">
        <Notice tone="success">{t.couponApplied(applied)}</Notice>
        <Button size="sm" tone="outline" icon="close" onClick={() => onApply('')}>{t.couponRemove}</Button>
      </div>
    );
  }
  return (
    <div className="coupon">
      <label htmlFor="coupon-input" className="field-label">{t.couponLabel}</label>
      <div className="coupon-row">
        <input
          id="coupon-input" type="text" value={text} maxLength={30} autoCapitalize="characters" autoComplete="off"
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) apply(); } }}
          aria-describedby={error ? 'coupon-error' : undefined}
        />
        <Button tone="blue" icon="check" disabled={busy || !text.trim()} onClick={apply}>{busy ? t.loading : t.couponApply}</Button>
      </div>
      {error && <p className="field-error" id="coupon-error" role="alert">{error}</p>}
    </div>
  );
}
