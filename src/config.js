// Edit these values before launch. The Supabase keys are NOT here: they go in .env (see .env.example).

// PLACEHOLDER: your WhatsApp number with country code, digits only (example: 919876543210)
export const WHATSAPP_NUMBER = '919999999999';

// PLACEHOLDER: the UPI ID where employers pay (example: jobsabroad@upi)
export const UPI_ID = 'yourname@upi';

// PLACEHOLDER: the name that belongs to that UPI ID (shown to employers so they can check who they pay)
export const UPI_NAME = 'Your Business Name';

// PLACEHOLDER: contact email shown on the Contact page
export const CONTACT_EMAIL = 'help@example.com';

// PLACEHOLDER: the final address of your site, no slash at the end (example: https://jobsabroad.example.com).
// Used at build time for the sitemap, share previews and Google job data. Leave as is until you know it.
export const SITE_URL = 'PASTE_SITE_URL_HERE';

// PLACEHOLDER (optional): your Plausible Analytics domain, e.g. jobsabroad.example.com. Empty = no analytics.
export const ANALYTICS_DOMAIN = '';

// PLACEHOLDER: the person who answers complaints and take-down requests (shown on the Contact page)
export const GRIEVANCE_NAME = 'Your Name';
export const GRIEVANCE_EMAIL = 'grievance@example.com';

export const SITE_NAME = 'Jobs Abroad';

/** True while a setting still holds its PASTE_ placeholder. */
export const isPlaceholder = (value) => !value || value.startsWith('PASTE_');
