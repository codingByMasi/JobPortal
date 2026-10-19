// Route table: which screen shows at which address.
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './app/Layout';
import ForgotPassword from './features/auth/ForgotPassword';
import RequireRole from './features/auth/RequireRole';
import ResetPassword from './features/auth/ResetPassword';
import { Loading } from './shared/ui/StateViews';
import Contact from './features/site/Contact';
import CountryJobs from './features/jobs/CountryJobs';
import DeleteAccount from './features/site/DeleteAccount';
import Agencies from './features/site/Agencies';
import InfoPage from './features/site/InfoPage';
import Home from './features/jobs/Home';
import JobDetail from './features/jobs/JobDetail';
import Jobs from './features/jobs/Jobs';
import Legal from './features/site/Legal';
import Login from './features/auth/Login';
import NotFound from './features/site/NotFound';
import PostJob from './features/site/PostJob';
import Signup from './features/auth/Signup';
const DashboardLayout = lazy(() => import('./features/recruiter/DashboardLayout'));
const EditAd = lazy(() => import('./features/recruiter/EditAd'));
const MyAds = lazy(() => import('./features/recruiter/MyAds'));
const MyApplications = lazy(() => import('./features/recruiter/MyApplications'));
const Profile = lazy(() => import('./features/recruiter/Profile'));
const NewAd = lazy(() => import('./features/recruiter/NewAd'));
const AdminApplications = lazy(() => import('./features/admin/AdminApplications'));
const AdminEmployers = lazy(() => import('./features/admin/AdminEmployers'));
const AdminHome = lazy(() => import('./features/admin/AdminHome'));
const AdminJobForm = lazy(() => import('./features/admin/AdminJobForm'));
const AdminJobs = lazy(() => import('./features/admin/AdminJobs'));
const AdminLayout = lazy(() => import('./features/admin/AdminLayout'));
const AdminGuides = lazy(() => import('./features/admin/AdminGuides'));
const AdminSettings = lazy(() => import('./features/admin/AdminSettings'));
const AdminReports = lazy(() => import('./features/admin/AdminReports'));
const AdminAudit = lazy(() => import('./features/admin/AdminAudit'));
const AdminOffers = lazy(() => import('./features/admin/AdminOffers'));
const AdminPackages = lazy(() => import('./features/admin/AdminPackages'));
const AdminPayments = lazy(() => import('./features/admin/AdminPayments'));
const AdminRequests = lazy(() => import('./features/admin/AdminRequests'));
const AdminSecurity = lazy(() => import('./features/admin/AdminSecurity'));
const AdminProblems = lazy(() => import('./features/admin/AdminProblems'));

export default function App() {
  return (
    <Suspense fallback={<div className="page"><Loading /></div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:countrySlug" element={<CountryJobs />} />
        <Route path="job/:id" element={<JobDetail />} />
        <Route path="post-job" element={<PostJob />} />
        <Route path="agencies" element={<Agencies />} />
        <Route path="check-agency" element={<InfoPage kind="check" />} />
        <Route path="contact" element={<Contact />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="about" element={<InfoPage kind="about" />} />
        <Route path="faq" element={<InfoPage kind="faq" />} />
        <Route path="refund-policy" element={<InfoPage kind="refund" />} />
        <Route path="delete-account" element={<DeleteAccount />} />
        <Route path="privacy" element={<Legal kind="privacy" />} />
        <Route path="terms" element={<Legal kind="terms" />} />

        <Route element={<RequireRole />}>
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<MyAds />} />
            <Route path="new" element={<NewAd />} />
            <Route path="edit/:id" element={<EditAd />} />
            <Route path="applications" element={<MyApplications />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<RequireRole admin />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route path="jobs" element={<AdminJobs />} />
            <Route path="jobs/new" element={<AdminJobForm />} />
            <Route path="jobs/:id" element={<AdminJobForm />} />
            <Route path="employers" element={<AdminEmployers />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="packages" element={<AdminPackages />} />
            <Route path="offers" element={<AdminOffers />} />
            <Route path="history" element={<AdminAudit />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="guides" element={<AdminGuides />} />
            <Route path="applications" element={<AdminApplications />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="problems" element={<AdminProblems />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
