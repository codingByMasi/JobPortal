// /dashboard/applications - people who applied to the employer's ads, with a WhatsApp button for each.
import Button from '../../shared/ui/Button';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { candidateWhatsApp, formatDate, whatsappLink } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** Applications for my ads. */
export default function MyApplications() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const apps = useAsync(() => api.listMyApplications(user.id), [user.id]);
  return (
    <section className="section">
      <AsyncView state={apps} empty={t.noApps} emptyIcon="users">
        {(rows) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.colDate}</th><th>{t.colAd}</th><th>{t.colName}</th><th>{t.colPhone}</th><th>{t.colCity}</th><th>{t.colMessage}</th><th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td data-label={t.colDate}>{formatDate(a.createdAt, lang)}</td>
                    <td data-label={t.colAd}>{a.jobTitle}</td>
                    <td data-label={t.colName}>{a.name}</td>
                    <td data-label={t.colPhone}>{a.phone}</td>
                    <td data-label={t.colCity}>{a.city || '-'}</td>
                    <td data-label={t.colMessage}>{a.message || '-'}</td>
                    <td data-label={t.colActions}>
                      <Button size="sm" icon="whatsapp" href={whatsappLink(candidateWhatsApp(a.phone), t.waToCandidate(a.jobTitle))} target="_blank" rel="noopener noreferrer">
                        {t.whatsappThem}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
    </section>
  );
}
