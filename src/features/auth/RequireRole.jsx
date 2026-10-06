// Keeps screens for logged-in people away from visitors. Use as a layout route: <Route element={<RequireRole />}>.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Icon from '../../shared/ui/Icon';
import { AsyncView, Loading } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import MfaPrompt from './MfaPrompt';
import { useAuth } from './AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** For admins who turned on the authenticator app: asks for the code before showing the admin area. */
function AdminStep() {
  const mfa = useAsync(() => api.mfaStatus(), []);
  return (
    <AsyncView state={mfa} isEmpty={() => false}>
      {(s) => (s.needsCode ? <MfaPrompt factorId={s.factorId} onDone={mfa.reload} /> : <Outlet />)}
    </AsyncView>
  );
}

/** `admin` = only admins. Otherwise any logged-in employer (or admin). */
export default function RequireRole({ admin = false }) {
  const { status, user, isAdmin } = useAuth();
  const { t } = useLang();
  const location = useLocation();

  if (status === 'loading') return <div className="page"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !isAdmin) {
    return (
      <div className="page">
        <div className="state">
          <Icon name="ban" size={56} className="state-icon warn" />
          <h1 className="state-title">{t.notAllowedTitle}</h1>
          <p className="state-text">{t.notAllowedText}</p>
        </div>
      </div>
    );
  }
  return admin ? <AdminStep /> : <Outlet />;
}
