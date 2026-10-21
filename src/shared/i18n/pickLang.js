// Which language to start in: the saved choice, otherwise the phone's language when we have it, otherwise English.

const CODES = ['en', 'hi', 'ml', 'ta', 'te', 'ur'];

/** `saved` is what was remembered (a language code or null); `phoneLanguages` is navigator.languages. */
export function pickLang(saved, phoneLanguages = []) {
  if (CODES.includes(saved)) return saved;
  const first = String(phoneLanguages[0] || '').toLowerCase().split('-')[0];
  return CODES.includes(first) ? first : 'en';
}
