// /admin - the work queue: what needs the admin today (licenses to check, ads to approve, ads ending, change requests), then the live count. Each number links to its list.
import { Link } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api, isDemo } from '../../shared/data';
import { useLang } from '../../shared/i18n/LangContext';
import { ENDED_RECENTLY_DAYS, ENDING_SOON_DAYS } from '../../shared/lib/jobStatus';
import { missingSettings } from '../../shared/lib/siteSettings';
import { useAsync } from '../../shared/lib/useAsync';
import { useSettings } from '../../shared/settings/SettingsContext';

/** One card of the queue. A card with work to do is marked (a "todo" look) so the eye finds it first. */
function Card({ to, icon, number, label, urgent }) {
  return (
    <Link className={`count-card${urgent && number > 0 ? ' is-todo' : ''}`} to={to}>
      <Icon name={icon} size={32} />
      <span className="count-number">{number}</span>
      <span>{label}</span>
    </Link>
  );
}

/** Admin dashboard. */
export default function AdminHome() {
  const { t } = useLang();
  const counts = useAsync(() => api.adminCounts(), []);
  const { settings, ready } = useSettings();
  const missing = ready ? missingSettings(settings, isDemo) : [];
  return (
    <section className="section">
      {missing.length > 0 && (
        <>
          <Notice tone="error">
            <strong>{t.settingsMissingTitle}</strong> {t.settingsMissingText(missing.map((n) => t.settingLabel[n]).join(', '))}
          </Notice>
          <Button to="/admin/settings" icon="settings" tone="outline">{t.settingsMissingLink}</Button>
        </>
      )}
      <AsyncView state={counts} isEmpty={() => false}>
        {(c) => (
          <>
            <h2 className="section-title">{t.queueTitle}</h2>
            <div className="count-grid">
              <Card urgent to="/admin/employers?license=waiting" icon="badge" number={c.licenses} label={t.cLicenses} />
              <Card urgent to="/admin/jobs?status=paid_pending_review" icon="clock" number={c.review} label={t.cReview} />
              <Card urgent to="/admin/jobs?ending=soon" icon="clock" number={c.endingSoon} label={t.cEnding(ENDING_SOON_DAYS)} />
              <Card urgent to="/admin/requests" icon="edit" number={c.requests} label={t.cRequests} />
              <Card urgent to="/admin/reports" icon="alert" number={c.reports} label={t.cReports} />
              <Card urgent to="/admin/reports" icon="trash" number={c.deletions} label={t.cDeletions} />
              <Card to="/admin/jobs?ending=ended" icon="refresh" number={c.ended} label={t.cEnded(ENDED_RECENTLY_DAYS)} />
              <Card to="/admin/jobs?status=live" icon="eye" number={c.live} label={t.cLive} />
            </div>
            {c.waitingPayment > 0 && (
              <Button to="/admin/jobs?status=pending_payment" tone="outline" icon="clock">{t.cOldUnpaid(c.waitingPayment)}</Button>
            )}
          </>
        )}
      </AsyncView>
    </section>
  );
}
