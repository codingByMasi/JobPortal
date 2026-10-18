// Demo: online payment does not exist without the real server (the button is hidden in demo mode); calling it says so.
import { fail } from './store';

export async function createRazorpayOrder() {
  throw fail('ONLINE_PAY_FAILED');
}
