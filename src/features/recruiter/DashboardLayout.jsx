// Employer area frame: greeting, status notes, tabs, and the chosen tab below.
import { Outlet } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import SubNav from '../../shared/ui/SubNav';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Layout route for /dashboard/*. */
export default function DashboardLayout() {
  const { t } = useLang();
  const { profile, signOut } = useAuth();
  usePageMeta(t.dashTitle, undefined, { noindex: true });

  const tabs = [
    { to: '/dashboard', icon: 'list', label: t.tabAds, end: true },
    { to: '/dashboard/new', icon: 'plus', label: t.tabNew },
    { to: '/dashboard/payments', icon: 'card', label: t.tabPayments },
    { to: '/dashboard/applications', icon: 'users', label: t.tabApplications },
  ];

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.hello(profile?.companyName || '')}</h1>
          <p className="help">{profile?.verified ? t.verifiedYes : t.verifiedNo}</p>
        </div>
        <Button tone="outline" size="sm" icon="logout" onClick={signOut}>{t.logout}</Button>
      </div>
      {profile?.blocked && <Notice tone="error">{t.blockedNote}</Notice>}
      <SubNav items={tabs} label={t.dashTitle} />
      <Outlet />
    </div>
  );
}
