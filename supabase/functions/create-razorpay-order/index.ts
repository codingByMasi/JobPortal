// Edge Function: create-razorpay-order. The employer's browser asks for an order for ONE of their ads; the price comes from the database, never from the browser.
// Secrets (supabase secrets set): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCreateOrder } from '../_shared/handlers.js';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { jobId } = await req.json();
    const { status, body } = await handleCreateOrder(jobId, {
      env: { RAZORPAY_KEY_ID: Deno.env.get('RAZORPAY_KEY_ID'), RAZORPAY_KEY_SECRET: Deno.env.get('RAZORPAY_KEY_SECRET') },
      getUserId: async () => (await asUser.auth.getUser()).data?.user?.id ?? null,
      rpc: (name: string, args: unknown) => admin.rpc(name, args),
      fetchFn: fetch,
    });
    return reply(status, body);
  } catch (_e) {
    return reply(500, { error: 'server' });
  }
});
