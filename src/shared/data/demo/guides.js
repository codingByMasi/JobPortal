// Demo: the guides. Only a short sample text; the real guides are published to the real project only (scripts/publish-guides.mjs).
import { needAdmin, wait } from './store';

const SAMPLE = [
  { slug: 'admin-guide', title: 'Admin guide', body: '# Admin guide\n\nThis is a demo copy.\n\n## Every day\n\n1. Open **Dashboard**.\n2. Approve or reject ads.\n\n| Tab | Use |\n|---|---|\n| All ads | approve, reject, hide |\n| Settings | UPI ID and WhatsApp |' },
  { slug: 'employer-guide', title: 'Employer guide', body: '# Employer guide\n\nDemo copy for employers.\n\n- Make an account\n- Post an ad\n- Pay by UPI' },
  { slug: 'job-seeker-guide', title: 'Job seeker guide', body: '# Job seeker guide\n\nDemo copy for job seekers.\n\n**Never pay money for a job.**' },
  { slug: 'app-features', title: 'What the app does', body: '# What the app does\n\nDemo copy of the feature list.' },
];

export async function adminListGuides() {
  await wait();
  needAdmin();
  return SAMPLE.map(({ slug, title }) => ({ slug, title }));
}

export async function adminGetGuide(slug) {
  await wait();
  needAdmin();
  const g = SAMPLE.find((x) => x.slug === slug);
  return g ? { ...g, updatedAt: null } : null;
}
