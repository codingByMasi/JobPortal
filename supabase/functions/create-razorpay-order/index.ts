// Edge Function: create-razorpay-order. The employer's browser asks for an order for ONE of their ads; the price comes from the database, never from the browser.
// Secrets (supabase secrets set): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createOrder } from '../_shared/razorpay.js';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) return reply(503, { error: 'not_ready' });

    // who is asking: the logged-in user from the token
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: auth } = await asUser.auth.getUser();
    if (!auth?.user) return reply(401, { error: 'login' });

    const { jobId } = await req.json();
    if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) return reply(400, { error: 'bad_request' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: info, error } = await admin.rpc('razorpay_order_info', { p_job: jobId, p_user: auth.user.id });
    if (error) return reply(400, { error: 'not_payable' });

    const orderId = await createOrder({
      keyId, keySecret, amountPaise: info.amount_paise, receipt: `ad-${jobId.slice(0, 8)}`, notes: { job_id: jobId },
    });
    const { error: attachError } = await admin.rpc('razorpay_attach_order', { p_payment: info.payment_id, p_order_id: orderId });
    if (attachError) return reply(500, { error: 'server' });
    return reply(200, { orderId, amountPaise: info.amount_paise, keyId, currency: 'INR' });
  } catch (_e) {
    return reply(500, { error: 'server' });
  }
});
