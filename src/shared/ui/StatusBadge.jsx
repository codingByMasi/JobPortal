// Small coloured label for an ad's status, and the Featured / Verified tags.
import Icon from './Icon';
import { effectiveStatus } from '../lib/jobStatus';
import { useLang } from '../i18n/LangContext';

/** Status of an ad as a coloured pill. */
export function StatusBadge({ job }) {
  const { t } = useLang();
  const s = effectiveStatus(job);
  return <span className={`badge badge-${s}`}>{t.statusShort[s]}</span>;
}

/** "Featured" and "Verified recruiter" tags (renders nothing when neither applies). */
export function JobTags({ job }) {
  const { t } = useLang();
  if (!job.featured && !job.verified) return null;
  return (
    <span className="tags">
      {job.featured && <span className="tag tag-featured"><Icon name="star" size={16} />{t.tagFeatured}</span>}
      {job.verified && <span className="tag tag-verified"><Icon name="badge" size={16} />{t.tagVerified}</span>}
    </span>
  );
}
