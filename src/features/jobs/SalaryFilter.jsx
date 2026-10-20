// The salary part of the jobs filters: pick a currency, then a minimum per month and "highest salary first".
import Icon from '../../shared/ui/Icon';
import Field from '../../shared/ui/Field';
import { useLang } from '../../shared/i18n/LangContext';

/** Currency chips (only currencies that ads really show); once one is chosen, a minimum box and a sort choice appear. */
export default function SalaryFilter({ currencies, currency, min, sort, setParam, onClear }) {
  const { t } = useLang();
  if (currencies.length === 0) return null;
  return (
    <>
      <fieldset className="chips">
        <legend>{t.salaryFilter}</legend>
        <button type="button" className="chip" aria-pressed={!currency} onClick={onClear}>
          <Icon name="grid" size={22} />{t.anyCurrency}
        </button>
        {currencies.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={currency === c} onClick={() => setParam('currency', c)}>{c}</button>
        ))}
      </fieldset>
      {currency && (
        <>
          <Field label={t.minSalaryLabel(currency)}>
            <input type="number" inputMode="numeric" min="0" step="100" value={min} onChange={(e) => setParam('min', e.target.value)} />
          </Field>
          <fieldset className="chips">
            <legend>{t.sortLabel}</legend>
            <button type="button" className="chip" aria-pressed={sort !== 'pay'} onClick={() => setParam('sort', '')}>{t.sortNewest}</button>
            <button type="button" className="chip" aria-pressed={sort === 'pay'} onClick={() => setParam('sort', 'pay')}>{t.sortPay}</button>
          </fieldset>
        </>
      )}
    </>
  );
}
