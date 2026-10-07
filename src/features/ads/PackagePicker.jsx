// Big cards to choose how long an ad shows. One card is chosen at a time.
import Icon from '../../shared/ui/Icon';
import { formatPrice } from '../../shared/lib/money';
import { useLang } from '../../shared/i18n/LangContext';

/** `packages` are the active ones. `value` is the chosen package id. */
export default function PackagePicker({ packages, value, onChange, error, quotes = {} }) {
  const { t } = useLang();
  return (
    <fieldset className={`packages${error ? ' has-error' : ''}`}>
      <legend>{t.choosePackage}</legend>
      <p className="field-help">{t.choosePackageHelp}</p>
      <div className="package-grid" role="radiogroup" aria-label={t.choosePackage}>
        {packages.map((p) => {
          const q = quotes[p.id];
          const saving = q && (q.discountPaise > 0 || q.bonusDays > 0);
          return (
          <label key={p.id} className={`package-card${value === p.id ? ' chosen' : ''}${p.featured ? ' is-featured' : ''}`}>
            <input type="radio" name="package" value={p.id} checked={value === p.id} onChange={() => onChange(p.id)} />
            {p.featured && <span className="tag tag-featured"><Icon name="star" size={16} />{t.tagFeatured}</span>}
            {p.badgeText && <span className="tag tag-badge">{p.badgeText}</span>}
            <span className="package-name">{p.name}</span>
            {saving && q.discountPaise > 0 && <span className="package-was">{t.pkgWas}: <s>{formatPrice(q.listPricePaise)}</s></span>}
            <span className="package-price">{formatPrice(saving ? q.finalPricePaise : p.pricePaise)}</span>
            {saving && <span className="tag tag-offer">{q.offerName || t.offerBadge}{q.percent ? ` · ${t.percentOff(q.percent)}` : ''}{q.bonusDays > 0 ? ` · +${t.pkgDays(q.bonusDays)}` : ''}</span>}
            <span className="package-days">{t.pkgDays(saving && q.bonusDays > 0 ? q.finalDays : p.durationDays)}</span>
            {p.description && <span className="muted">{p.description}</span>}
            <ul className="package-includes">
              <li><Icon name="check" size={18} />{t.pkgInclude1(p.durationDays)}</li>
              <li><Icon name="check" size={18} />{t.pkgInclude2}</li>
              <li><Icon name="check" size={18} />{t.pkgInclude3}</li>
              {p.featured && <li><Icon name="check" size={18} />{t.pkgInclude4}</li>}
            </ul>
            {value === p.id && <span className="package-chosen"><Icon name="check" size={20} />{t.pkgChosen}</span>}
          </label>
          );
        })}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </fieldset>
  );
}
