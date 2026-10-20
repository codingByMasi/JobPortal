// Post a Job: 3 short steps (account + license, verification, post the ad), then the right button for a visitor or a logged-in employer.
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Post a Job screen. */
export default function PostJob() {
  const { t } = useLang();
  const { user } = useAuth();
  usePageMeta(t.postTitle);
  const steps = [
    { icon: 'user', text: t.postStep1 },
    { icon: 'badge', text: t.postStep2 },
    { icon: 'badge', text: t.postStep3 },
  ];
  return (
    <div className="page">
      <SectionHeading as="h1" icon="upload" title={t.postTitle} help={t.postHelp} />
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.icon}>
            <span className="step-num">{i + 1}</span>
            <Icon name={s.icon} size={30} />
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="actions">
        {user ? (
          <Button to="/dashboard/new" icon="upload">{t.postGo}</Button>
        ) : (
          <>
            <Button to="/signup" icon="user">{t.postStart}</Button>
            <Button to="/login" tone="outline" icon="logout">{t.postHave}</Button>
          </>
        )}
      </div>
    </div>
  );
}
