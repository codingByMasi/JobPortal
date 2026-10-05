// Drawn "ad" used when a job has no uploaded file (sample data), at card size or large.
import Icon from '../../shared/ui/Icon';
import { CATEGORIES } from '../../shared/lib/catalog';
import { useLang } from '../../shared/i18n/LangContext';

/** Coloured box with the job type icon (or a PDF mark). `large` shows the full poster text. */
export default function AdPoster({ job, large = false }) {
  const { t } = useLang();
  const icon = CATEGORIES.find((c) => c.id === job.category)?.icon || 'grid';
  const isPdf = job.fileType === 'pdf';
  return (
    <div className={`poster tone-${isPdf ? 'pdf' : [...String(job.id)].reduce((n, c) => n + c.charCodeAt(0), 0) % 3 + 1}${large ? ' poster-large' : ''}`}>
      {large && <p className="poster-company">{job.company}</p>}
      <Icon name={isPdf ? 'file' : icon} size={large ? 88 : 56} />
      {isPdf && <p className="poster-pdf">{t.pdf}</p>}
      {large && (
        <>
          <p className="poster-hiring">{t.hiring}</p>
          <p className="poster-title">{job.title}</p>
        </>
      )}
      {!large && !isPdf && (
        <span className="poster-badge"><Icon name="image" size={14} />{t.imageBadge}</span>
      )}
    </div>
  );
}
