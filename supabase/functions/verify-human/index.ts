// Edge Function: verify-human. Checks a Cloudflare Turnstile answer and hands out a one-time pass for the Apply and Report forms (docs/22-spam-protection.md).
// Deploy with: supabase functions deploy verify-human --no-verify-jwt   (visitors are not logged in; Cloudflare's answer is the proof)
// Secrets (supabase secrets set): TURNSTILE_SECRET_KEY, SITE_URL. Without TURNSTILE_SECRET_KEY it refuses everything.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor, verifyHuman } from '../_shared/humanCheck.js';

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'), Deno.env.get('SITE_URL'));
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let token: unknown = null;
  try {
    token = (await req.json())?.token;
  } catch {
    return json(400, { error: 'token' });
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { status, body } = await verifyHuman(token as string, {
    env: { TURNSTILE_SECRET_KEY: Deno.env.get('TURNSTILE_SECRET_KEY') },
    fetchFn: fetch,
    insertPass: async () => {
      const { data, error } = await admin.from('human_passes').insert({}).select('id').single();
      if (error) throw error;
      return data.id;
    },
  });
  return json(status, body);
});
