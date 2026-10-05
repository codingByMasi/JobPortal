// Big cards to choose how long an ad shows. One card is chosen at a time.
import Icon from '../../shared/ui/Icon';
import { formatPrice } from '../../shared/lib/money';
import { useLang } from '../../shared/i18n/LangContext';

/** `packages` are the active ones. `value` is the chosen package id. */
export default function PackagePicker({ packages, value, onChange, error }) {
  const { t } = useLang();
  return (
    <fieldset className={`packages${error ? ' has-error' : ''}`}>
      <legend>{t.choosePackage}</legend>
      <p className="field-help">{t.choosePackageHelp}</p>
      <div className="package-grid" role="radiogroup" aria-label={t.choosePackage}>
        {packages.map((p) => (
          <label key={p.id} className={`package-card${value === p.id ? ' chosen' : ''}${p.featured ? ' is-featured' : ''}`}>
            <input type="radio" name="package" value={p.id} checked={value === p.id} onChange={() => onChange(p.id)} />
            {p.featured && <span className="tag tag-featured"><Icon name="star" size={16} />{t.tagFeatured}</span>}
            <span className="package-name">{p.name}</span>
            <span className="package-price">{formatPrice(p.pricePaise)}</span>
            <span className="package-days">{t.pkgDays(p.durationDays)}</span>
            <ul className="package-includes">
              <li><Icon name="check" size={18} />{t.pkgInclude1(p.durationDays)}</li>
              <li><Icon name="check" size={18} />{t.pkgInclude2}</li>
              <li><Icon name="check" size={18} />{t.pkgInclude3}</li>
              {p.featured && <li><Icon name="check" size={18} />{t.pkgInclude4}</li>}
            </ul>
            {value === p.id && <span className="package-chosen"><Icon name="check" size={20} />{t.pkgChosen}</span>}
          </label>
        ))}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </fieldset>
  );
}
