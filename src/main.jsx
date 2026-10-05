import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './app/ErrorBoundary';
import SetupMissing from './app/SetupMissing';
import { startAnalytics } from './app/analytics';
import { AuthProvider } from './features/auth/AuthContext';
import { JobsProvider } from './features/jobs/JobsContext';
import { appMode } from './shared/data/env';
import { LangProvider } from './shared/i18n/LangContext';
import './styles/base.css';
import './styles/app.css';

startAnalytics();

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
            <JobsProvider>
              <App />
            </JobsProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </LangProvider>
  );

createRoot(document.getElementById('root')).render(<StrictMode>{content}</StrictMode>);
