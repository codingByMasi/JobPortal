// The fixed lists of countries and kinds of work shown as buttons across the app.

export const COUNTRIES = [
  { id: 'uae', name: 'UAE', iso: 'AE', flag: '🇦🇪' },
  { id: 'saudi', name: 'Saudi Arabia', iso: 'SA', flag: '🇸🇦' },
  { id: 'qatar', name: 'Qatar', iso: 'QA', flag: '🇶🇦' },
  { id: 'kuwait', name: 'Kuwait', iso: 'KW', flag: '🇰🇼' },
  { id: 'oman', name: 'Oman', iso: 'OM', flag: '🇴🇲' },
  { id: 'others', name: 'Others', flag: '🌍' },
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
