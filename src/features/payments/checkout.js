// Razorpay Checkout in the browser: loads their script once and opens the payment window for an order the SERVER created.
// The window's "success" answer is only a hint to refresh the screen; the ad becomes paid ONLY when the signed webhook arrives.
const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading;

/** Loads Razorpay's script once. Rejects when it cannot load (offline, blocked). */
export function loadCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => resolve(window.Razorpay);
    el.onerror = () => {
      loading = null;
      el.remove();
      reject(Object.assign(new Error('checkout script failed'), { code: 'NETWORK' }));
    };
    document.head.appendChild(el);
  });
  return loading;
}

/** The options Razorpay Checkout needs. Pure, so it can be tested. */
export function checkoutOptions({ order, name, description, email, phone, onPaid, onDismiss }) {
  return {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amountPaise,
    currency: order.currency,
    name,
    description,
    prefill: { email: email || '', contact: phone || '' },
    handler: onPaid,
    modal: { ondismiss: onDismiss },
  };
}

/** Opens the payment window. `onPaid` runs when Razorpay says the payment went through, `onDismiss` when the person closes the window. */
export async function openCheckout(opts) {
  const Razorpay = await loadCheckout();
  new Razorpay(checkoutOptions(opts)).open();
}
