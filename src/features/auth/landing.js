// Where to send someone after they log in.

/**
 * `from` is the page they were trying to open. They go back there if it is a normal page of this site
 * and they may open it; an employer is never sent to an /admin address. Otherwise: admin -> /admin, employer -> /dashboard.
 */
export function landingPath(from, isAdmin) {
  const internal = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//');
  const allowed = internal && (!from.startsWith('/admin') || isAdmin);
  if (allowed && !from.startsWith('/login') && !from.startsWith('/signup')) return from;
  return isAdmin ? '/admin' : '/dashboard';
}
