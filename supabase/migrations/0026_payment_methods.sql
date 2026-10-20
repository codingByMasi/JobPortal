-- 0026: payments are recorded as manual (UPI, checked by the admin), a free offer, or a complimentary ad. No other method exists.
-- Fails (and changes nothing) if any payment row has a different method.
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('manual', 'free_offer', 'complimentary'));
