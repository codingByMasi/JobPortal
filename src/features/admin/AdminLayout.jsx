// Admin area frame: title, tabs, and the chosen tab below.
import { Outlet } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import SubNav from '../../shared/ui/SubNav';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Layout route for /admin/*. */
export default function AdminLayout() {
  const { t } = useLang();
  const { signOut } = useAuth();
  usePageMeta(t.adminTitle, undefined, { noindex: true });

  const tabs = [
    { to: '/admin', icon: 'grid', label: t.tabDashboard, end: true },
    { to: '/admin/jobs', icon: 'list', label: t.tabAdminJobs },
    { to: '/admin/employers', icon: 'users', label: t.tabEmployers },
    { to: '/admin/payments', icon: 'card', label: t.tabAdminPayments },
    { to: '/admin/packages', icon: 'box', label: t.tabPackages },
    { to: '/admin/offers', icon: 'badge', label: t.tabOffers },
    { to: '/admin/applications', icon: 'file', label: t.tabAdminApps },
    { to: '/admin/requests', icon: 'edit', label: t.tabAdminRequests },
    { to: '/admin/guides', icon: 'file', label: t.tabGuides },
    { to: '/admin/settings', icon: 'settings', label: t.tabSettings },
    { to: '/admin/security', icon: 'shield', label: t.tabSecurity },
    { to: '/admin/reports', icon: 'alert', label: t.tabReports },
    { to: '/admin/history', icon: 'list', label: t.tabAudit },
    { to: '/admin/problems', icon: 'alert', label: t.tabProblems },
  ];

  return (
    <div className="page wide">
      <div className="page-head">
        <h1 className="page-title">{t.adminTitle}</h1>
        <Button tone="outline" size="sm" icon="logout" onClick={signOut}>{t.logout}</Button>
      </div>
      <SubNav items={tabs} label={t.adminTitle} />
      <Outlet />
    </div>
  );
}
