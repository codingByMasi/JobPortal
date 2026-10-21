// All on-screen text. English and Hindi are complete. Malayalam, Tamil, Telugu and Urdu hold the texts job seekers see; anything missing shows in English.
// Add or fix wording in the language files only.
import { en } from './en';
import { hi } from './hi';
import { ml } from './ml';
import { ta } from './ta';
import { te } from './te';
import { ur } from './ur';

/** The texts that are written for the partial languages (the tests check them against English). */
export const partialTexts = { ml, ta, te, ur };

const withEnglish = (part) => ({ ...en, ...part });

export const translations = { en, hi, ml: withEnglish(ml), ta: withEnglish(ta), te: withEnglish(te), ur: withEnglish(ur) };

/** The languages a visitor can choose, with their own names. `dir` is the reading direction. */
export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { code: 'ml', name: 'മലയാളം', dir: 'ltr' },
  { code: 'ta', name: 'தமிழ்', dir: 'ltr' },
  { code: 'te', name: 'తెలుగు', dir: 'ltr' },
  { code: 'ur', name: 'اردو', dir: 'rtl' },
];
