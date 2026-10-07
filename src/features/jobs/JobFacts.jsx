// The facts of one ad in words: a short line for the list card, a full list for the ad page.
import Icon from '../../shared/ui/Icon';
import { isPastLastDate, salaryText } from '../../shared/lib/jobFacts';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';

/** `compact` shows salary and experience only (for the card); otherwise every fact the ad has. Renders nothing when there are none. */
export default function JobFacts({ job, compact = false }) {
  const { t, lang } = useLang();
  const salary = salaryText(job);
  const rows = [
    salary && { key: 'salary', icon: 'rupee', label: t.salaryLabel, value: `${salary} ${t.perMonth}` },
    job.experienceLevel && { key: 'exp', icon: 'hardhat', label: t.experienceLabel, value: t.exp[job.experienceLevel] },
    !compact && job.vacancies && { key: 'vac', icon: 'users', label: t.vacanciesLabel, value: String(job.vacancies) },
    !compact && job.lastDate && { key: 'last', icon: 'clock', label: t.lastDateLabel, value: isPastLastDate(job) ? t.lastDatePassed : formatDate(job.lastDate, lang) },
    !compact && job.visaType && { key: 'visa', icon: 'file', label: t.visaLabel, value: job.visaType },
  ].filter(Boolean);
  if (rows.length === 0) return null;
  if (compact) {
    return (
      <p className="job-facts-line">
        {rows.map((r) => <span key={r.key}><Icon name={r.icon} size={18} />{r.value}</span>)}
      </p>
    );
  }
  return (
    <dl className="job-facts">
      {rows.map((r) => (
        <div key={r.key}><dt><Icon name={r.icon} size={20} />{r.label}</dt><dd>{r.value}</dd></div>
      ))}
    </dl>
  );
}
