// The fixed lists of countries and kinds of work shown as buttons across the app.

export const COUNTRIES = [
  { id: 'uae', slug: 'uae', name: 'UAE', iso: 'AE', flag: '🇦🇪' },
  { id: 'saudi', slug: 'saudi-arabia', name: 'Saudi Arabia', iso: 'SA', flag: '🇸🇦' },
  { id: 'qatar', slug: 'qatar', name: 'Qatar', iso: 'QA', flag: '🇶🇦' },
  { id: 'kuwait', slug: 'kuwait', name: 'Kuwait', iso: 'KW', flag: '🇰🇼' },
  { id: 'oman', slug: 'oman', name: 'Oman', iso: 'OM', flag: '🇴🇲' },
  { id: 'others', slug: 'other-countries', name: 'Others', flag: '🌍' },
];

// `match` words are looked for inside the sheet's category text, so "Office job" still finds "office".
export const CATEGORIES = [
  { id: 'plumber', icon: 'wrench', match: ['plumb', 'pipe'] },
  { id: 'electrician', icon: 'zap', match: ['electric'] },
  { id: 'driver', icon: 'truck', match: ['driver', 'driving'] },
  { id: 'technician', icon: 'settings', match: ['technic', 'mechanic', 'ac '] },
  { id: 'cook', icon: 'cooking', match: ['cook', 'chef'] },
  { id: 'helper', icon: 'hardhat', match: ['helper', 'labour', 'labor'] },
  { id: 'office', icon: 'building', match: ['office', 'clerk', 'account'] },
  { id: 'other', icon: 'grid', match: [] },
];

const COUNTRY_ALIASES = {
  uae: 'uae', 'united arab emirates': 'uae', dubai: 'uae',
  saudi: 'saudi', 'saudi arabia': 'saudi', ksa: 'saudi',
  qatar: 'qatar', kuwait: 'kuwait', oman: 'oman',
};

/** Maps free text from the sheet to one of the country ids ("others" when unknown). */
export function countryId(text = '') {
  return COUNTRY_ALIASES[text.trim().toLowerCase()] || 'others';
}

/** Maps free text from the sheet to one of the category ids ("other" when unknown). */
export function categoryId(text = '') {
  const t = `${text.trim().toLowerCase()} `;
  const hit = CATEGORIES.find((c) => c.match.some((m) => t.includes(m)));
  return hit ? hit.id : 'other';
}

export const countryById = (id) => COUNTRIES.find((c) => c.id === id) || COUNTRIES[COUNTRIES.length - 1];

/** The country for an address like /jobs/saudi-arabia (null when unknown). */
export const countryBySlug = (slug) => COUNTRIES.find((c) => c.slug === slug) || null;

/** Experience levels of the structured job fields (the ids are saved in the database). */
export const EXPERIENCE = ['fresher', '1-2', '2-5', '5+'];

/** Salary currencies the form offers (Gulf currencies, rupee and dollar). */
export const CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'INR', 'USD'];
