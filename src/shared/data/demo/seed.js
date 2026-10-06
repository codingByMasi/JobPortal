// Sample data for demo mode (no Supabase). Rows use the same field names as the real database.
// Demo logins (test values only, used only in demo mode):
//   employer  recruiter@example.com / recruiter123
//   admin     admin@example.com     / admin123

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const ymd = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const DEMO_LOGINS = {
  recruiter: { email: 'recruiter@example.com', password: 'recruiter123' },
  admin: { email: 'admin@example.com', password: 'admin123' },
};

/** Builds a fresh demo database. Dates are counted from `now` so ads never look old. */
export function buildSeed(now = Date.now()) {
  const job = (n, o) => ({
    id: `job-${n}`, recruiter_id: 'u-rec', package_id: 'pkg-30', company: '', city: '', file_url: null, file_path: null,
    file_type: 'image', whatsapp: '', status: 'live', reject_reason: null, starts_at: null, expires_at: null,
    posted_date: ymd(now), created_at: iso(now), ...o,
  });
  const live = (n, daysAgo, daysLeft, o) =>
    job(n, { starts_at: iso(now - daysAgo * DAY), expires_at: iso(now + daysLeft * DAY), posted_date: ymd(now - daysAgo * DAY), created_at: iso(now - daysAgo * DAY), ...o });

  return {
    v: 2,
    session: null,
    users: [
      { id: 'u-admin', email: DEMO_LOGINS.admin.email, password: DEMO_LOGINS.admin.password },
      { id: 'u-rec', email: DEMO_LOGINS.recruiter.email, password: DEMO_LOGINS.recruiter.password },
      { id: 'u-rec2', email: 'other@example.com', password: 'other12345' },
    ],
    profiles: [
      { id: 'u-admin', email: DEMO_LOGINS.admin.email, role: 'admin', company_name: 'Jobs Abroad Team', phone: '919999999999', verified: true, blocked: false, created_at: iso(now - 90 * DAY) },
      { id: 'u-rec', email: DEMO_LOGINS.recruiter.email, role: 'recruiter', company_name: 'Gulf Works', phone: '919876543210', verified: true, blocked: false, created_at: iso(now - 60 * DAY) },
      { id: 'u-rec2', email: 'other@example.com', role: 'recruiter', company_name: 'Desert Transport', phone: '919812345678', verified: false, blocked: false, created_at: iso(now - 30 * DAY) },
    ],
    packages: [
      { id: 'pkg-7', name: '7 Days', price_paise: 29900, duration_days: 7, featured: false, active: true },
      { id: 'pkg-30', name: '30 Days', price_paise: 79900, duration_days: 30, featured: false, active: true },
      { id: 'pkg-30f', name: '30 Days Featured', price_paise: 149900, duration_days: 30, featured: true, active: true },
    ],
    jobs: [
      live(1, 1, 29, { title: 'Plumbers Needed', company: 'Gulf Works', country: 'uae', city: 'Dubai', category: 'plumber', package_id: 'pkg-30f', whatsapp: '919876543210' }),
      live(2, 2, 28, { recruiter_id: 'u-rec2', title: 'Heavy Driver', company: 'Desert Transport', country: 'saudi', city: 'Riyadh', category: 'driver', file_type: 'pdf', whatsapp: '919812345678' }),
      live(3, 3, 27, { title: 'Building Electrician', company: 'Gulf Works', country: 'qatar', city: 'Doha', category: 'electrician' }),
      live(4, 4, 3, { recruiter_id: 'u-rec2', title: 'Restaurant Cook', company: 'Spice Garden', country: 'kuwait', city: 'Kuwait City', category: 'cook', package_id: 'pkg-7', file_type: 'pdf' }),
      live(5, 5, 25, { title: 'AC Technician', company: 'Cool Air Services', country: 'oman', city: 'Muscat', category: 'technician' }),
      job(6, { title: 'Office Assistant', company: 'Gulf Works', country: 'saudi', city: 'Jeddah', category: 'office', status: 'paid_pending_review', posted_date: ymd(now - DAY), created_at: iso(now - DAY) }),
      job(7, { title: 'Kitchen Helper', company: 'Gulf Works', country: 'oman', city: 'Salalah', category: 'helper', package_id: 'pkg-30f', status: 'pending_payment' }),
      live(8, 40, -33, { title: 'Site Helper', company: 'Gulf Works', country: 'uae', city: 'Abu Dhabi', category: 'helper', package_id: 'pkg-7', status: 'expired' }),
      job(9, { recruiter_id: 'u-rec2', title: 'Driver wanted', company: 'Desert Transport', country: 'others', city: 'Bahrain', category: 'driver', package_id: 'pkg-7', status: 'rejected', reject_reason: 'The phone number is missing in the ad.', created_at: iso(now - 3 * DAY) }),
    ],
    payments: [
      { id: 'pay-1', job_id: 'job-1', recruiter_id: 'u-rec', amount_paise: 149900, currency: 'INR', method: 'manual', status: 'paid', note: 'UPI, ref 4821', created_at: iso(now - DAY) },
      { id: 'pay-2', job_id: 'job-8', recruiter_id: 'u-rec', amount_paise: 29900, currency: 'INR', method: 'manual', status: 'paid', note: '', created_at: iso(now - 40 * DAY) },
      { id: 'pay-3', job_id: 'job-6', recruiter_id: 'u-rec', amount_paise: 79900, currency: 'INR', method: 'manual', status: 'paid', note: 'UPI, ref 5530', created_at: iso(now - 0.5 * DAY) },
    ],
    change_requests: [
      { id: 'req-1', job_id: 'job-1', recruiter_id: 'u-rec', message: 'Please change the WhatsApp number to 919876500000.', status: 'open', created_at: iso(now - 0.2 * DAY), handled_at: null },
    ],
    applications: [
      { id: 'app-1', job_id: 'job-1', name: 'Ramesh Kumar', phone: '9876500001', city: 'Lucknow', message: '5 years of plumbing work in Dubai.', created_at: iso(now - 0.3 * DAY) },
      { id: 'app-2', job_id: 'job-1', name: 'Sunil Yadav', phone: '9876500002', city: 'Patna', message: '', created_at: iso(now - 0.1 * DAY) },
      { id: 'app-3', job_id: 'job-2', name: 'Imran Khan', phone: '9876500003', city: 'Delhi', message: 'Heavy licence, 8 years.', created_at: iso(now - DAY) },
    ],
  };
}
