-- 0025: online payments with Razorpay are not used (decision of the owner). Removes what migration 0023 added for it.
-- Kept on purpose: mark_job_paid() (the admin's "Mark as paid" still uses it) and the payment method list from migration 0018.
-- Safety: stops if any Razorpay money record exists, so a real payment record is never dropped.
do $$
begin
  if exists (select 1 from public.razorpay_events)
     or exists (select 1 from public.payments where razorpay_order_id is not null or razorpay_payment_id is not null or method = 'razorpay') then
    raise exception 'Razorpay payment records exist: keep them and do not run this migration.';
  end if;
end;
$$;

drop function if exists public.razorpay_order_info(uuid, uuid);
drop function if exists public.razorpay_attach_order(uuid, text);
drop function if exists public.razorpay_capture(text, text, text, integer);
drop function if exists public.razorpay_refund(text, text);
drop table if exists public.razorpay_events;
drop index if exists public.payments_razorpay_order_unique;
drop index if exists public.payments_razorpay_payment_unique;
alter table public.payments drop column if exists razorpay_order_id;
alter table public.payments drop column if exists razorpay_payment_id;
