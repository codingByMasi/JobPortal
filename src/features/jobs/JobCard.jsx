// One job ad in a list: thumbnail, type + date, tags, title, place, big View button.
import AdPoster from './AdPoster';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import { JobTags } from '../../shared/ui/StatusBadge';
import { countryById } from '../../shared/lib/catalog';
import { relativeDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAdImage } from './useAdImage';

/** Card for the job lists on Home and Jobs. */
export default function JobCard({ job }) {
  const { t, lang } = useLang();
  const image = useAdImage(job.fileUrl);
  const isPdf = job.fileType === 'pdf';
  const country = countryById(job.country);
  const showPicture = !isPdf && !image.failed;
  const place = [job.city, t.country[job.country]].filter(Boolean).join(', ');

  return (
    <article className={`job-card${job.featured ? ' is-featured' : ''}`}>
      <div className="job-thumb">
        {showPicture ? (
          <img src={image.src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={image.onError} />
        ) : (
          <AdPoster job={job} />
        )}
      </div>
      <div className="job-info">
        <div className="job-meta">
          <span className={`job-type ${isPdf ? 'is-pdf' : ''}`}>
            <Icon name={isPdf ? 'file' : 'image'} size={18} />
            {isPdf ? t.pdfAd : t.imageAd}
          </span>
          <span className="job-date">{relativeDate(job.startsAt || job.posted, t, lang)}</span>
        </div>
        <JobTags job={job} />
        <h3 className="job-title">{job.title}</h3>
        <p className="job-place">
          <span className="flag" aria-hidden="true">{country.flag}</span>
          <Icon name="pin" size={20} />
          <span>{place}</span>
        </p>
      </div>
      <Button to={`/job/${encodeURIComponent(job.id)}`} icon="eye" aria-label={`${t.view}: ${job.title}`}>{t.view}</Button>
    </article>
  );
}
