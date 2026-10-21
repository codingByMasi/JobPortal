// Small helpers for the CV maker: turn typed text into clean lists and decide what the CV shows. Nothing here talks to a server.

/** "a, b ,, c" (commas, or one per line) -> ['a', 'b', 'c']; at most `max` items of `len` letters. */
export function toList(text, { max = 20, len = 60 } = {}) {
  return String(text ?? '').split(/[,\n]/).map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, max);
}

/** One line per education item, kept as typed (not split on commas). */
export function toLines(text, { max = 10, len = 100 } = {}) {
  return String(text ?? '').split('\n').map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, max);
}

/** A job entry counts when it has at least a job title or a company. */
export const hasExperience = (e) => Boolean((e.role || '').trim() || (e.company || '').trim());

/** True when there is anything worth showing on the CV sheet. */
export function cvHasContent(cv) {
  return Boolean(
    (cv.name || '').trim() || (cv.phone || '').trim() || (cv.want || '').trim() || (cv.about || '').trim()
    || cv.experience.some(hasExperience) || toList(cv.skills).length || toList(cv.languages).length || toLines(cv.education).length,
  );
}

export const emptyExperience = () => ({ role: '', company: '', years: '', details: '' });
export const MAX_EXPERIENCE = 6;
