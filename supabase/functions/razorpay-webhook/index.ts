// Edge Function: razorpay-webhook. The ONLY way an online payment marks an ad paid. Deploy with: supabase functions deploy razorpay-webhook --no-verify-jwt
// (Razorpay has no Supabase login; the signature is the proof.) Secrets: RAZORPAY_WEBHOOK_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from '../_shared/handlers.js';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const body = await req.text(); // the RAW text: the signature is over exactly these bytes
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { status, text } = await handleWebhook(body, req.headers.get('x-razorpay-signature'), req.headers.get('x-razorpay-event-id'), {
    env: { RAZORPAY_WEBHOOK_SECRET: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') },
    rpc: (name: string, args: unknown) => admin.rpc(name, args),
  });
  return new Response(text, { status });
});
