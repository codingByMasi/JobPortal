// Supabase: the guides (admin, employer, job seeker, features). Only an admin can read them: the database refuses everybody else.
import { ok, supabase } from './client';

/** The list of guides (slug, title), in order. The text is loaded one guide at a time. */
export async function adminListGuides() {
  return ok(await supabase.from('guides').select('slug, title').order('sort_order')).map((g) => ({ slug: g.slug, title: g.title }));
}

/** One guide with its text. */
export async function adminGetGuide(slug) {
  const row = ok(await supabase.from('guides').select('slug, title, body, updated_at').eq('slug', slug).maybeSingle());
  return row ? { slug: row.slug, title: row.title, body: row.body, updatedAt: Date.parse(row.updated_at) || null } : null;
}
