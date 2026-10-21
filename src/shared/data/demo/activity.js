// Demo: what the admins did (the demo admin log). Same shape as the database copy.
import { toActivity } from '../mappers';
import { needAdmin, newest, profileOf, state, wait } from './store';

export async function adminListActivity({ action = '' } = {}) {
  await wait();
  needAdmin();
  return [...(state.db.admin_log || [])]
    .filter((r) => !action || r.action === action)
    .sort(newest)
    .slice(0, 300)
    .map((r) => toActivity(r, r.admin_id ? profileOf(r.admin_id) : null));
}
