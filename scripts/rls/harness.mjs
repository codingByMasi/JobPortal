// Test harness: a REAL Postgres (PGlite, runs inside Node) with the REAL migrations applied.
// Only the parts of Supabase that live outside our SQL are faked: the roles anon / authenticated, auth.users + auth.uid(),
// and the storage tables. Everything else (tables, triggers, policies, functions, the public view) is our own SQL, untouched.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');

/** What Supabase provides before our SQL runs. Mirrors the real thing closely enough for our policies. */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  -- Supabase reads the logged-in user from the request token; here we read a setting the tests change.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  -- Supabase's default: everyone may TRY everything on new public tables; Row Level Security then decides.
  grant usage on schema public, storage to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
`;

/** A fresh database with the stubs, every migration in order, and seed.sql. */
export async function makeDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(join(supabaseDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(readFileSync(join(supabaseDir, 'migrations', f), 'utf8'));
  await db.exec(readFileSync(join(supabaseDir, 'seed.sql'), 'utf8'));
  return db;
}

/** Creates a login the way signup does (the trigger then makes the profile). Returns the user id. */
export async function addUser(db, email, meta = {}) {
  const { rows } = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, JSON.stringify(meta)]);
  return rows[0].id;
}

/**
 * Runs `work` as a visitor (who = null) or as a logged-in user (who = user id), with Row Level Security applying,
 * exactly like a browser request. Always switches back to the all-powerful setup role afterwards.
 */
export async function as(db, who, work) {
  await db.exec(`set role ${who ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who || '']);
  try {
    return await work();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** Shortcuts for reading answers. */
export const rowsOf = async (db, sql, params) => (await db.query(sql, params)).rows;
export const countOf = async (db, sql, params) => Number((await db.query(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n);

/** Expects a database error; returns it so the test can look at the code or message. */
export async function denied(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the database to refuse this, but it was allowed.');
}
