-- 0023: online payments with Razorpay (Phase 2). See docs/08-phase2-payments.md.
-- The browser can never mark an ad paid. Only the two Edge Functions (service role) call the razorpay_* functions below,
-- and "paid" is decided in ONE place: mark_job_paid(), also used by the admin button.

-- ===== Razorpay ids on the payment =====
alter table public.payments add column if not exists razorpay_order_id text;
alter table public.payments add column if not exists razorpay_payment_id text;
create unique index if not exists payments_razorpay_order_unique on public.payments (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists payments_razorpay_payment_unique on public.payments (razorpay_payment_id) where razorpay_payment_id is not null;

-- ===== every webhook event, so one event is never processed twice; admins can read it to reconcile =====
create table if not exists public.razorpay_events (
  event_id   text primary key,
  event_type text not null,
  outcome    text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.razorpay_events enable row level security;
drop policy if exists "razorpay events admin read" on public.razorpay_events;
create policy "razorpay events admin read" on public.razorpay_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.razorpay_events from anon, authenticated;
revoke all on public.razorpay_events from anon;

-- ===== the one place that makes an ad "paid" =====
create or replace function public.mark_job_paid(p_job uuid, p_amount_paise integer, p_method text, p_reference text, p_note text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_payment public.payments;
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  select * into v_payment from public.payments where job_id = v_job.id and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = p_method, amount_paise = p_amount_paise, note = coalesce(p_note, ''), reference = v_ref
     where id = v_payment.id returning * into v_payment;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, reference, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (v_job.id, v_job.recruiter_id, p_amount_paise, p_method, 'paid', coalesce(p_note, ''), v_ref, v_job.list_price_paise, v_job.discount_paise, v_job.final_price_paise, v_job.offer_id, v_job.duration_days_final)
    returning * into v_payment;
  end if;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  return v_payment;
end;
$$;
revoke all on function public.mark_job_paid(uuid, integer, text, text, text) from public, anon, authenticated;

-- the admin button now goes through mark_job_paid (same rules and same answer as before)
create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  v_amount := coalesce(p_amount_paise, v_job.final_price_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  v_payment := public.mark_job_paid(p_job, v_amount, 'manual', p_reference, p_note);
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;

-- ===== for the Edge Function "create-razorpay-order" (service role only) =====
-- Checks the caller owns the ad and it waits for payment; the amount is the price SAVED with the order, never one from the browser.
create or replace function public.razorpay_order_info(p_job uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_pay public.payments;
begin
  select * into v_job from public.jobs where id = p_job and recruiter_id = p_user for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  select * into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if not found then raise exception 'Choose a plan first.' using errcode = '23514'; end if;
  if coalesce(v_pay.amount_paise, 0) <= 0 then raise exception 'Nothing to pay.' using errcode = '23514'; end if;
  return jsonb_build_object('payment_id', v_pay.id, 'amount_paise', v_pay.amount_paise, 'job_id', v_job.id);
end;
$$;

create or replace function public.razorpay_attach_order(p_payment uuid, p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments set razorpay_order_id = p_order_id where id = p_payment and status = 'created';
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
end;
$$;

-- ===== for the Edge Function "razorpay-webhook" (service role only) =====
-- Returns what happened: paid, duplicate, unknown_order, amount_mismatch, not_waiting. Never raises for a bad event, so Razorpay does not retry forever.
create or replace function public.razorpay_capture(p_event_id text, p_order_id text, p_payment_id text, p_amount_paise integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_job     public.jobs;
  v_outcome text;
begin
  insert into public.razorpay_events (event_id, event_type, outcome) values (p_event_id, 'payment.captured', 'working') on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_pay from public.payments where razorpay_order_id = p_order_id for update;
  if not found then
    v_outcome := 'unknown_order';
  elsif v_pay.status <> 'created' then
    v_outcome := case when v_pay.razorpay_payment_id = p_payment_id then 'duplicate' else 'not_waiting' end;
  elsif v_pay.amount_paise is distinct from p_amount_paise then
    v_outcome := 'amount_mismatch';
  else
    select * into v_job from public.jobs where id = v_pay.job_id for update;
    if not found or v_job.status <> 'pending_payment' then
      v_outcome := 'not_waiting';
    else
      perform public.mark_job_paid(v_job.id, p_amount_paise, 'razorpay', p_payment_id, 'Razorpay');
      update public.payments set razorpay_payment_id = p_payment_id where job_id = v_job.id and status = 'paid';
      insert into public.admin_log (admin_id, action, target_id, detail) values (null, 'razorpay_paid', v_job.id, p_amount_paise || ' paise');
      v_outcome := 'paid';
    end if;
  end if;
  update public.razorpay_events set outcome = v_outcome, detail = left(p_order_id || ' ' || p_payment_id, 200) where event_id = p_event_id;
  return v_outcome;
end;
$$;

create or replace function public.razorpay_refund(p_event_id text, p_payment_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_outcome text;
begin
  insert into public.razorpay_events (event_id, event_type, outcome) values (p_event_id, 'refund.processed', 'working') on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_pay from public.payments where razorpay_payment_id = p_payment_id for update;
  if not found then
    v_outcome := 'unknown_payment';
  elsif v_pay.status <> 'paid' then
    v_outcome := 'not_paid';
  else
    update public.payments set status = 'refunded' where id = v_pay.id;
    insert into public.admin_log (admin_id, action, target_id, detail) values (null, 'razorpay_refund', v_pay.id, 'refunded in Razorpay');
    v_outcome := 'refunded';
  end if;
  update public.razorpay_events set outcome = v_outcome, detail = left(p_payment_id, 200) where event_id = p_event_id;
  return v_outcome;
end;
$$;

revoke all on function public.razorpay_order_info(uuid, uuid) from public, anon, authenticated;
revoke all on function public.razorpay_attach_order(uuid, text) from public, anon, authenticated;
revoke all on function public.razorpay_capture(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.razorpay_refund(text, text) from public, anon, authenticated;
