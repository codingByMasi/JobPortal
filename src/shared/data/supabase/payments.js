// Supabase: starting an online payment. The Edge Function reads the price from the database; the browser sends only the ad id.
import { supabase } from './client';

/** Asks the server for a Razorpay order for one of my ads. Returns { orderId, amountPaise, keyId, currency }. */
export async function createRazorpayOrder(jobId) {
  const { data, error } = await supabase.functions.invoke('create-razorpay-order', { body: { jobId } });
  if (error || !data?.orderId) {
    const status = error?.context?.status;
    throw Object.assign(new Error('online payment failed'), { code: status === 401 ? 'NEED_LOGIN' : status === 400 ? 'NOT_WAITING' : 'ONLINE_PAY_FAILED' });
  }
  return { orderId: data.orderId, amountPaise: data.amountPaise, keyId: data.keyId, currency: data.currency };
}
