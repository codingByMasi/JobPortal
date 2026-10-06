// Which language to start in: the saved choice, otherwise Hindi when the phone is set to Hindi, otherwise English.

/** `saved` is what was remembered ("hi", "en" or null); `phoneLanguages` is navigator.languages. */
export function pickLang(saved, phoneLanguages = []) {
  if (saved === 'hi' || saved === 'en') return saved;
  const first = String(phoneLanguages[0] || '').toLowerCase();
  return first.startsWith('hi') ? 'hi' : 'en';
}
