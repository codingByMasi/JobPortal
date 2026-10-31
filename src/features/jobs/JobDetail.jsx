// Job detail: the full ad (image with tap-to-zoom, or PDF), Download, Apply on WhatsApp, Apply form, Back.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../shared/data';
import { useAsync } from '../../shared/lib/useAsync';
import AdPoster from './AdPoster';
import ApplyForm from './ApplyForm';
import FraudBanner from './FraudBanner';
import JobFacts from './JobFacts';
import ReportAd from './ReportAd';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import { JobTags } from '../../shared/ui/StatusBadge';
import { JobsStatus } from '../../shared/ui/StateViews';
import { countryById } from '../../shared/lib/catalog';
import { applyMessage } from '../../shared/lib/jobFacts';
import { downloadLink, formatDate, relativeDate, whatsappLink, whatsappShareLink } from '../../shared/lib/format';
import { useJobs } from './JobsContext';
import { useLang } from '../../shared/i18n/LangContext';
import { useAuth } from '../auth/AuthContext';
import { useAdImage } from './useAdImage';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import { useSettings } from '../../shared/settings/SettingsContext';

/** Full-screen picture viewer. Tap anywhere or press Esc to close; focus stays inside and returns on close. */
function Lightbox({ src, onClose }) {
  const { t } = useLang();
  const closeRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        e.preventDefault(); // the close button is the only control, so keep focus on it
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t.zoom} onClick={onClose}>
      <button ref={closeRef} type="button" className="lightbox-close" onClick={onClose}>
        <Icon name="close" size={28} /><span>{t.close}</span>
      </button>
      <img src={src} alt="" referrerPolicy="no-referrer" />
    </div>
  );
}

/** Job detail screen for /job/:id. */
export default function JobDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { jobs, status, reload } = useJobs();
  const [zoomed, setZoomed] = useState(false);
  const listed = jobs.find((j) => j.id === id);
  // a shared link to an ad that is not in the loaded list: ask for that one ad
  const extra = useAsync(() => (status === 'ready' && !listed ? api.getLiveJob(id).catch(() => null) : Promise.resolve(null)), [id, status, Boolean(listed)]);
  const job = listed || extra.data;
  const image = useAdImage(job?.fileUrl);
  usePageMeta(job?.title, job ? `${job.title} - ${job.city}` : undefined);

  // count the view once per browser per ad per day; logged-in people (employers, admins) are not counted
  useEffect(() => {
    if (!job?.id || user) return;
    const key = `viewed:${job.id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: count anyway */
    }
    api.recordAdView(job.id).catch(() => {});
  }, [job?.id, user]);

  const back = <Button to="/jobs" tone="outline" icon="back">{t.back}</Button>;

  if (status !== 'ready' || (!job && extra.status === 'loading')) {
    return <div className="page loading-tall">{back}<JobsStatus status={status === 'ready' ? 'loading' : status} onRetry={reload} /></div>;
  }
  if (!job) {
    return (
      <div className="page">
        {back}
        <div className="state"><Icon name="alert" size={56} className="state-icon warn" /><p className="state-text">{t.notFound}</p></div>
      </div>
    );
  }

  const isPdf = job.fileType === 'pdf';
  const country = countryById(job.country);
  const place = [job.city, t.country[job.country]].filter(Boolean).join(', ');
  const hasFile = Boolean(job.fileUrl);
  const rel = relativeDate(job.startsAt || job.posted, t, lang);
  const postedText = !rel ? '' : rel === t.today ? t.postedToday : t.postedOn(rel);
  const waLink = whatsappLink(job.whatsapp || settings.whatsappNumber, applyMessage(job, t, lang, place, formatDate));
  const base = settings.siteUrl || window.location.origin;
  const shareLink = whatsappShareLink(t.shareMessage(job.title, place, `${base}/job/${encodeURIComponent(job.id)}`));

  return (
    <div className="page detail">
      {back}

      <div className="job-meta">
        <span className={`job-type ${isPdf ? 'is-pdf' : ''}`}>
          <Icon name={isPdf ? 'file' : 'image'} size={20} />{isPdf ? t.pdfAd : t.imageAd}
        </span>
        <span className="job-date">{postedText}</span>
      </div>
      <JobTags job={job} />

      <div className="ad-frame">
        {!hasFile && <AdPoster job={job} large />}
        {hasFile && !isPdf && !image.failed && (
          <>
            <img className="ad-image" src={image.src} alt={job.title} decoding="async" referrerPolicy="no-referrer" onError={image.onError} />
            <button type="button" className="zoom-btn" onClick={() => setZoomed(true)}>
              <Icon name="zoom" size={24} />{t.zoom}
            </button>
          </>
        )}
        {hasFile && !isPdf && image.failed && <p className="state-text pad">{t.imageFailed}</p>}
        {hasFile && isPdf && (
          <>
            <iframe className="ad-pdf" src={job.fileUrl} title={job.title} loading="lazy" />
            <a className="pdf-open" href={job.fileUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="file" size={32} />{t.pdfOpen}
            </a>
          </>
        )}
      </div>
      {hasFile && !isPdf && !image.failed && <p className="help center">{t.zoomHelp}</p>}

      <h1 className="detail-title">{job.title}</h1>
      <p className="job-place big">
        <span className="flag" aria-hidden="true">{country.flag}</span>
        <Icon name="pin" size={22} />
        <span>{place}</span>
      </p>
      {job.company && <p className="help">{job.company}</p>}
      {job.verified && job.raNumber && <p className="help ra-line"><Icon name="badge" size={20} />{t.raNumberShown(job.raNumber)}</p>}
      <JobFacts job={job} />
      {job.details && (
        <section className="job-details">
          <h2>{t.detailsTitle}</h2>
          <p>{job.details}</p>
        </section>
      )}

      <div className="actions">
        {hasFile && (
          <Button tone="blue" icon="download" href={downloadLink(job.fileUrl, isPdf ? 'job-ad.pdf' : 'job-ad.jpg')} download={isPdf ? 'job-ad.pdf' : 'job-ad.jpg'} target="_blank" rel="noopener noreferrer">
            {t.download}
          </Button>
        )}
        <Button icon="whatsapp" href={waLink} target="_blank" rel="noopener noreferrer">{t.whatsapp}</Button>
        <Button tone="outline" icon="whatsapp" href={shareLink} target="_blank" rel="noopener noreferrer">{t.shareWhatsapp}</Button>
      </div>

      <ApplyForm job={job} />

      <FraudBanner />
      <p className="notice"><Icon name="alert" size={26} /><span>{t.safety}</span></p>
      <ReportAd job={job} />

      {zoomed && <Lightbox src={image.src} onClose={() => setZoomed(false)} />}
    </div>
  );
}
