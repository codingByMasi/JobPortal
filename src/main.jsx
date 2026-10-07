import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './app/ErrorBoundary';
import SetupMissing from './app/SetupMissing';
import { startAnalytics } from './app/analytics';
import { reportError } from './app/errorReport';
import { AuthProvider } from './features/auth/AuthContext';
import { JobsProvider } from './features/jobs/JobsContext';
import { SettingsProvider } from './shared/settings/SettingsContext';
import { appMode } from './shared/data/env';
import { LangProvider } from './shared/i18n/LangContext';
import './styles/base.css';
import './styles/app.css';

startAnalytics();
window.addEventListener('error', (event) => reportError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason));

// After a new release an open page may ask for a file that no longer exists. Reload once to get the new release (never in a loop).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('reloaded-for-release')) return;
    sessionStorage.setItem('reloaded-for-release', '1');
  } catch {
    return;
  }
  window.location.reload();
});

// A published site without its Supabase settings must not quietly show fake demo data.
const content =
  appMode === 'blocked' ? (
    <LangProvider>
      <SetupMissing />
    </LangProvider>
  ) : (
    <LangProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <SettingsProvider>
              <JobsProvider>
                <App />
              </JobsProvider>
            </SettingsProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </LangProvider>
  );

createRoot(document.getElementById('root')).render(<StrictMode>{content}</StrictMode>);
