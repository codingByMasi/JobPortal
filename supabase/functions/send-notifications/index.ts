// Edge Function: send-notifications. Sends the queued emails to employers and the job-alert mails to visitors. Called every few minutes by Supabase Cron (docs/20-notifications.md).
// Deploy with: supabase functions deploy send-notifications --no-verify-jwt   (the shared secret below is the proof, not a Supabase login)
// Secrets (supabase secrets set): NOTIFY_SECRET, RESEND_API_KEY, NOTIFY_FROM, SITE_URL. Without RESEND_API_KEY and NOTIFY_FROM it sends nothing.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleRun } from '../_shared/alertMail.js';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { status, body } = await handleRun(req.headers.get('x-notify-secret'), {
    env: {
      NOTIFY_SECRET: Deno.env.get('NOTIFY_SECRET'),
      RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'),
      NOTIFY_FROM: Deno.env.get('NOTIFY_FROM'),
      SITE_URL: Deno.env.get('SITE_URL'),
    },
    rpc: (name: string, args: unknown) => admin.rpc(name, args),
    fetchFn: fetch,
  });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
});
