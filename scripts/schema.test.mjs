import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSchema } from './schema.mjs';

const sql = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

describe('database files', () => {
  it('schema.sql is up to date with the migrations (run: npm run schema)', () => {
    expect(sql('schema.sql')).toBe(buildSchema());
  });

  it('every table has Row Level Security switched on', () => {
    const all = buildSchema();
    const dropped = [...all.matchAll(/drop table if exists public\.(\w+)/g)].map((m) => m[1]); // a table that a later migration removed
    const tables = [...all.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]).filter((name) => !dropped.includes(name));
    expect(tables.sort()).toEqual(['admin_log', 'app_settings', 'applications', 'audit_log', 'blocked_contacts', 'change_requests', 'deletion_requests', 'error_log', 'guides', 'jobs', 'offer_redemptions', 'offers', 'packages', 'payments', 'profiles', 'reports', 'site_settings', 'verification_requests']);
    for (const t of tables) expect(all).toMatch(new RegExp(String.raw`alter table public\.${t}\s+enable row level security`));
  });

  it('employers cannot write payments or change locked ad fields (checked in the SQL text)', () => {
    const all = buildSchema();
    expect(all).not.toMatch(/create policy "payments[^"]*" on public\.payments\s+for (insert|update|delete|all) to authenticated/);
    for (const field of ['status', 'package_id', 'starts_at', 'expires_at', 'recruiter_id']) {
      expect(all).toContain(`new.${field}`);
    }
    expect(all).toContain("file_url ~* '^https://'");
    expect(all).toContain('/storage/v1/object/public/job-files/');
  });

  it('the Apply form has duplicate and flood protection', () => {
    const all = buildSchema();
    expect(all).toContain('applications_one_per_phone');
    expect(all).toMatch(/count\(\*\) from public\.applications where job_id = new\.job_id\) >= 1000/);
  });

  it('employers have limits on unpaid ads, stored files and text size', () => {
    const all = buildSchema();
    expect(all).toMatch(/status = 'pending_payment'\) >= 20/);
    expect(all).toMatch(/storage\.objects o[\s\S]*< 100/);
    expect(all).toContain('profiles_company_name_length');
  });

  it('browsers cannot call the expiry function; admin functions check is_admin()', () => {
    const all = buildSchema();
    expect(all).toContain('revoke all on function public.expire_jobs() from public, anon, authenticated');
    const adminFunctions = all.split('create or replace function public.admin_').slice(1);
    expect(adminFunctions.length).toBeGreaterThanOrEqual(2);
    for (const body of adminFunctions) {
      expect(body.split(/\n\$\$;/)[0]).toMatch(/if not public\.is_admin\(\) then raise exception/); // every admin function checks for itself
    }
  });
});
