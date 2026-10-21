// Supabase: what the admins did (the admin log). Only an admin can read it; the database functions write it.
import { toActivity } from '../mappers';
import { ok, supabase } from './client';

/** The newest 300 lines of the admin log, each with the name of the admin who did it. `action` narrows to one kind of action. */
export async function adminListActivity({ action = '' } = {}) {
  let query = supabase.from('admin_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (action) query = query.eq('action', action);
  const rows = ok(await query);
  const ids = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
  const people = ids.length ? ok(await supabase.from('profiles').select('id, company_name, email').in('id', ids)) : [];
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  return rows.map((r) => toActivity(r, byId[r.admin_id]));
}
