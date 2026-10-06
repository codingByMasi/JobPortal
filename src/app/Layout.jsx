// Page frame: header with brand, account button and language toggle; bottom navigation; footer.
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from '../shared/ui/Icon';
import { WHATSAPP_NUMBER } from '../config';
import { api, isDemo } from '../shared/data';
import { useAuth } from '../features/auth/AuthContext';
import { whatsappLink } from '../shared/lib/format';
import { useLang } from '../shared/i18n/LangContext';

const NAV = [
  { to: '/', icon: 'home', label: 'navHome', end: true },
  { to: '/jobs', icon: 'briefcase', label: 'navJobs' },
  { to: '/contact', icon: 'phone', label: 'navContact' },
];

/** Wraps every screen. The 3-item nav sits at the bottom on phones and in the header on wide screens. */
export default function Layout() {
  const { t, toggle } = useLang();
  const { user, isAdmin } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const resetDemo = async () => {
    await api.resetDemo();
    window.location.assign('/');
  };

  return (
    <div className="app">
      {isDemo && (
        <div className="demo-banner" role="note">
          <span>{t.demoBanner}</span>
          <button type="button" onClick={resetDemo}>{t.demoReset}</button>
        </div>
      )}
      <header className="site-header">
        <div className="header-row">
          <Link to="/" className="brand">
            <span className="brand-mark"><Icon name="briefcase" size={26} /></span>
            <span className="brand-name">{t.siteName}</span>
          </Link>
          <Link to={user ? (isAdmin ? '/admin' : '/dashboard') : '/login'} className="account-btn" aria-label={user ? t.myAccount : t.login}>
            <Icon name="user" size={22} />
            <span>{user ? t.myAccount : t.login}</span>
          </Link>
          <button type="button" className="lang-btn" onClick={toggle} aria-label={`${t.langButton}. ${t.langLabel}`}>
            <Icon name="languages" size={22} />
            <span>{t.langButton}</span>
          </button>
        </div>
        <nav className="bottom-nav" aria-label={t.navLabel}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={n.icon} size={26} />
              <span>{t[n.label]}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="main"><Outlet /></main>

      <footer className="site-footer">
        <div className="footer-brand"><Icon name="briefcase" size={28} /><span>{t.siteName}</span></div>
        <a className="footer-link" href={whatsappLink(WHATSAPP_NUMBER)} target="_blank" rel="noopener noreferrer">
          <Icon name="phone" size={22} /><span>{t.footerHelp}</span>
        </a>
        <Link className="footer-link" to="/post-job"><Icon name="upload" size={22} /><span>{t.postTitle}</span></Link>
        <div className="legal-links">
          <Link className="footer-link" to="/privacy"><Icon name="shield" size={22} /><span>{t.privacyLink}</span></Link>
          <Link className="footer-link" to="/terms"><Icon name="shield" size={22} /><span>{t.termsLink}</span></Link>
        </div>
      </footer>
    </div>
  );
}
