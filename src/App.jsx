// Route table: which screen shows at which address.
import { Route, Routes } from 'react-router-dom';
import Layout from './app/Layout';
import RequireRole from './features/auth/RequireRole';
import Contact from './features/site/Contact';
import Home from './features/jobs/Home';
import JobDetail from './features/jobs/JobDetail';
import Jobs from './features/jobs/Jobs';
import Legal from './features/site/Legal';
import Login from './features/auth/Login';
import NotFound from './features/site/NotFound';
import PostJob from './features/site/PostJob';
import Signup from './features/auth/Signup';
import DashboardLayout from './features/recruiter/DashboardLayout';
import EditAd from './features/recruiter/EditAd';
import MyAds from './features/recruiter/MyAds';
import MyApplications from './features/recruiter/MyApplications';
import MyPayments from './features/recruiter/MyPayments';
import NewAd from './features/recruiter/NewAd';
import Pay from './features/payments/Pay';
import AdminApplications from './features/admin/AdminApplications';
import AdminEmployers from './features/admin/AdminEmployers';
import AdminHome from './features/admin/AdminHome';
import AdminJobForm from './features/admin/AdminJobForm';
import AdminJobs from './features/admin/AdminJobs';
import AdminLayout from './features/admin/AdminLayout';
import AdminPackages from './features/admin/AdminPackages';
import AdminPayments from './features/admin/AdminPayments';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="job/:id" element={<JobDetail />} />
        <Route path="post-job" element={<PostJob />} />
        <Route path="contact" element={<Contact />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="privacy" element={<Legal kind="privacy" />} />
        <Route path="terms" element={<Legal kind="terms" />} />

        <Route element={<RequireRole />}>
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<MyAds />} />
            <Route path="new" element={<NewAd />} />
            <Route path="edit/:id" element={<EditAd />} />
            <Route path="pay/:id" element={<Pay />} />
            <Route path="payments" element={<MyPayments />} />
            <Route path="applications" element={<MyApplications />} />
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
            <Route path="applications" element={<AdminApplications />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
