// Edge Function: razorpay-webhook. The ONLY way an online payment marks an ad paid. Deploy with: supabase functions deploy razorpay-webhook --no-verify-jwt
// (Razorpay has no Supabase login; the signature below is the proof.) Secrets: RAZORPAY_WEBHOOK_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { readEvent, verifySignature } from '../_shared/razorpay.js';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const body = await req.text(); // the RAW text: the signature is over exactly these bytes
  const ok = await verifySignature(body, req.headers.get('x-razorpay-signature') || '', Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '');
  if (!ok) return new Response('bad signature', { status: 401 });

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_e) {
    return new Response('bad body', { status: 400 });
  }
  const event = readEvent(req.headers.get('x-razorpay-event-id') || '', payload);
  if (!event) return new Response('ignored', { status: 200 }); // an event we do not act on: say OK so Razorpay stops sending it

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = event.kind === 'captured'
    ? await admin.rpc('razorpay_capture', { p_event_id: event.eventId, p_order_id: event.orderId, p_payment_id: event.paymentId, p_amount_paise: event.amountPaise })
    : await admin.rpc('razorpay_refund', { p_event_id: event.eventId, p_payment_id: event.paymentId });
  // a database error means "try again later": Razorpay retries for 24 hours
  return new Response(error ? 'retry' : 'ok', { status: error ? 500 : 200 });
});
