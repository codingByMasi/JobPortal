-- Jobs Abroad migration 0018
-- ---------------------------------------------------------------------
-- 20. FLEXIBLE PLANS AND OFFERS
--     - plans: description, order, badge, max files; a plan that has ads cannot be deleted
--     - offers (percent, flat, bonus days, free), coupon codes, who they apply to, dates, usage limits
--     - redemptions, a change log (audit_log) for plans and offers
--     - the price saved with every ad and payment: list price, discount, final price, offer, final days
--     - quote_price(): the ONLY place a price is worked out; create_ad_order(): saves the order
--     - admin: extend days, toggle featured on one ad, give a free ad
--     Phase 1 only: no online payment. Phase 2 can call quote_price_for() from its order function.
-- ---------------------------------------------------------------------

-- ===== plans =====
alter table public.packages add column if not exists description text not null default '';
alter table public.packages add column if not exists sort_order integer not null default 0;
alter table public.packages add column if not exists badge_text text not null default '';
alter table public.packages add column if not exists max_files integer not null default 1;
alter table public.packages drop constraint if exists packages_description_length;
alter table public.packages add constraint packages_description_length check (char_length(description) <= 200);
alter table public.packages drop constraint if exists packages_badge_length;
alter table public.packages add constraint packages_badge_length check (char_length(badge_text) <= 30);
alter table public.packages drop constraint if exists packages_max_files_range;
alter table public.packages add constraint packages_max_files_range check (max_files between 1 and 10);

update public.packages p set sort_order = x.rn * 10
  from (select id, row_number() over (order by price_paise, created_at) as rn from public.packages) x
 where p.id = x.id and p.sort_order = 0;

-- a new plan goes to the end of the list
create or replace function public.packages_set_order()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from public.packages), 0) + 10;
  end if;
  return new;
end;
$$;
revoke all on function public.packages_set_order() from public, anon, authenticated;
drop trigger if exists packages_set_order_trg on public.packages;
create trigger packages_set_order_trg before insert on public.packages for each row execute function public.packages_set_order();

-- a plan that has ads cannot be deleted (turn it off instead)
create or replace function public.packages_guard_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.jobs where package_id = old.id) then
    raise exception 'This plan has ads. Turn it off instead.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.packages_guard_delete() from public, anon, authenticated;
drop trigger if exists packages_guard_delete_trg on public.packages;
create trigger packages_guard_delete_trg before delete on public.packages for each row execute function public.packages_guard_delete();

-- visitors and employers read only plans that are on, plus the plan of their own ads (so an old ad never loses its plan name)
drop policy if exists "packages read all" on public.packages;
drop policy if exists "packages read active" on public.packages;
create policy "packages read active" on public.packages
  for select using (
    active
    or public.is_admin()
    or exists (select 1 from public.jobs j where j.package_id = packages.id and j.recruiter_id = (select auth.uid()))
  );

-- ===== offers =====
create table if not exists public.offers (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(btrim(name)) between 1 and 80),
  type                   text not null check (type in ('percent', 'flat', 'bonus_days', 'free')),
  value                  numeric not null default 0 check (value >= 0),   -- percent (1-100), rupees in PAISE (flat), or days (bonus_days)
  applies_to             text not null default 'all' check (applies_to in ('all', 'package', 'recruiter')),
  package_id             uuid references public.packages (id) on delete cascade,
  recruiter_id           uuid references public.profiles (id) on delete cascade,
  coupon_code            text check (coupon_code is null or coupon_code ~ '^[A-Za-z0-9_-]{3,30}$'),
  starts_at              timestamptz,
  ends_at                timestamptz,
  max_uses               integer check (max_uses is null or max_uses >= 1),
  max_uses_per_recruiter integer not null default 1 check (max_uses_per_recruiter >= 1),
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  constraint offers_value_by_type check (
    (type = 'percent' and value between 1 and 100)
    or (type = 'flat' and value >= 100 and value = trunc(value))
    or (type = 'bonus_days' and value between 1 and 365 and value = trunc(value))
    or (type = 'free')),
  constraint offers_target check (
    (applies_to = 'all' and package_id is null and recruiter_id is null)
    or (applies_to = 'package' and package_id is not null and recruiter_id is null)
    or (applies_to = 'recruiter' and recruiter_id is not null and package_id is null)),
  constraint offers_dates check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create unique index if not exists offers_coupon_unique on public.offers (lower(coupon_code)) where coupon_code is not null;
create index if not exists offers_active_idx on public.offers (active, applies_to);

create table if not exists public.offer_redemptions (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references public.offers (id) on delete cascade,
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,   -- deleting an unpaid ad gives the use back
  discount_paise integer not null default 0 check (discount_paise >= 0),
  bonus_days    integer not null default 0 check (bonus_days >= 0),
  created_at    timestamptz not null default now()
);
create unique index if not exists offer_redemptions_job_unique on public.offer_redemptions (job_id);
create index if not exists offer_redemptions_offer_idx on public.offer_redemptions (offer_id, recruiter_id);

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at);
create index if not exists audit_log_table_idx on public.audit_log (table_name, created_at);

alter table public.offers enable row level security;
alter table public.offer_redemptions enable row level security;
alter table public.audit_log enable row level security;

-- offers: admins do everything. Employers read only ACTIVE offers with no secret code that are for everyone or for their plan-wide use,
-- plus offers made for them personally. They never see coupon codes of other offers.
drop policy if exists "offers admin all" on public.offers;
create policy "offers admin all" on public.offers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "offers employer read" on public.offers;
create policy "offers employer read" on public.offers
  for select to authenticated
  using (active and ((coupon_code is null and applies_to in ('all', 'package')) or (applies_to = 'recruiter' and recruiter_id = (select auth.uid()))));

-- redemptions: admins everything; an employer reads only their own; nobody else writes (only create_ad_order does)
drop policy if exists "redemptions admin all" on public.offer_redemptions;
create policy "redemptions admin all" on public.offer_redemptions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "redemptions read own" on public.offer_redemptions;
create policy "redemptions read own" on public.offer_redemptions for select to authenticated using (recruiter_id = (select auth.uid()));

-- audit log: admins read; nobody writes directly
drop policy if exists "audit log read" on public.audit_log;
create policy "audit log read" on public.audit_log for select using (public.is_admin());
revoke all on public.audit_log from anon;
revoke all on public.offers from anon;
revoke all on public.offer_redemptions from anon;

-- every change to a plan or an offer is written to the audit log
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  insert into public.audit_log (admin_id, action, table_name, record_id, old_value, new_value)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce((v_new ->> 'id'), (v_old ->> 'id'))::uuid, v_old, v_new);
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;
drop trigger if exists packages_audit_trg on public.packages;
create trigger packages_audit_trg after insert or update or delete on public.packages for each row execute function public.audit_row();
drop trigger if exists offers_audit_trg on public.offers;
create trigger offers_audit_trg after insert or update or delete on public.offers for each row execute function public.audit_row();

-- ===== the price saved with every ad and payment =====
alter table public.jobs add column if not exists list_price_paise integer;
alter table public.jobs add column if not exists discount_paise integer not null default 0;
alter table public.jobs add column if not exists final_price_paise integer;
alter table public.jobs add column if not exists offer_id uuid references public.offers (id) on delete set null;
alter table public.jobs add column if not exists duration_days_final integer;
alter table public.jobs add column if not exists featured_override boolean;      -- admin can make one ad featured (or not), whatever its plan says
alter table public.payments add column if not exists list_price_paise integer;
alter table public.payments add column if not exists discount_paise integer not null default 0;
alter table public.payments add column if not exists final_price_paise integer;
alter table public.payments add column if not exists offer_id uuid references public.offers (id) on delete set null;
alter table public.payments add column if not exists duration_days_final integer;
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('manual', 'razorpay', 'free_offer', 'complimentary'));

update public.jobs set list_price_paise = price_paise_at_order, final_price_paise = price_paise_at_order, duration_days_final = days_at_order
 where list_price_paise is null and price_paise_at_order is not null;

-- deleting an unpaid ad also removes its waiting ("created") payment; its offer use is given back by the foreign key
create or replace function public.jobs_clear_waiting_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.payments where job_id = old.id and status = 'created';
  return old;
end;
$$;
revoke all on function public.jobs_clear_waiting_payment() from public, anon, authenticated;
drop trigger if exists jobs_clear_waiting_payment_trg on public.jobs;
create trigger jobs_clear_waiting_payment_trg before delete on public.jobs for each row execute function public.jobs_clear_waiting_payment();

-- ===== guards: new price columns are locked for employers; the order function may change them =====
create or replace function public.jobs_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if exists (select 1 from public.blocked_contacts where phone_last10 = public.phone_last10(new.whatsapp)) then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  if new.package_id is null
     or not exists (select 1 from public.packages where id = new.package_id and active) then
    raise exception 'Please choose a package.' using errcode = '23514';
  end if;
  if (select count(*) from public.jobs where recruiter_id = auth.uid() and status = 'pending_payment') >= 20 then
    raise exception 'Too many unpaid ads.' using errcode = '53400';
  end if;
  if new.thumb_path is not null and new.file_path is null then
    raise exception 'Bad file.' using errcode = '42501';
  end if;
  new.file_url   := public.job_file_checked_url(auth.uid(), new.file_path);
  new.thumb_url  := public.job_file_checked_url(auth.uid(), new.thumb_path);
  new.file_type  := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  select price_paise, duration_days into new.price_paise_at_order, new.days_at_order
    from public.packages where id = new.package_id;
  -- the first saved price is the plan's list price; create_ad_order replaces it with the quote (offers) right after
  new.list_price_paise     := new.price_paise_at_order;
  new.discount_paise       := 0;
  new.final_price_paise    := new.price_paise_at_order;
  new.duration_days_final  := new.days_at_order;
  new.offer_id             := null;
  new.featured_override    := null;
  new.recruiter_id   := auth.uid();
  new.status         := 'pending_payment';
  new.starts_at      := null;
  new.expires_at     := null;
  new.reject_reason  := null;
  new.posted_date    := current_date;
  return new;
end;
$$;
revoke all on function public.jobs_guard_insert() from public, anon, authenticated;

create or replace function public.jobs_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resubmit boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- create_ad_order (our own trusted function) switches this on for its own few statements only
  if current_setting('app.order_in_progress', true) = 'on' then
    return new;
  end if;
  v_resubmit := old.status = 'rejected' and new.status = 'paid_pending_review' and new.reject_reason is null;
  if (new.status is distinct from old.status and not v_resubmit)
     or (new.reject_reason is distinct from old.reject_reason and not v_resubmit)
     or new.package_id    is distinct from old.package_id
     or new.starts_at     is distinct from old.starts_at
     or new.expires_at    is distinct from old.expires_at
     or new.recruiter_id  is distinct from old.recruiter_id
     or new.posted_date   is distinct from old.posted_date
     or new.price_paise_at_order is distinct from old.price_paise_at_order
     or new.days_at_order is distinct from old.days_at_order
     or new.list_price_paise     is distinct from old.list_price_paise
     or new.discount_paise       is distinct from old.discount_paise
     or new.final_price_paise    is distinct from old.final_price_paise
     or new.offer_id             is distinct from old.offer_id
     or new.duration_days_final  is distinct from old.duration_days_final
     or new.featured_override    is distinct from old.featured_override then
    raise exception 'You cannot change this.' using errcode = '42501';
  end if;
  if new.file_path is distinct from old.file_path or new.file_url is distinct from old.file_url
     or new.thumb_path is distinct from old.thumb_path or new.thumb_url is distinct from old.thumb_url then
    if new.thumb_path is not null and new.file_path is null then
      raise exception 'Bad file.' using errcode = '42501';
    end if;
    new.file_url  := public.job_file_checked_url(auth.uid(), new.file_path);
    new.thumb_url := public.job_file_checked_url(auth.uid(), new.thumb_path);
    new.file_type := case when new.file_path ilike '%.pdf' then 'pdf' else 'image' end;
  end if;
  return new;
end;
$$;
revoke all on function public.jobs_guard_update() from public, anon, authenticated;

-- the public list: an ad is featured when the admin says so for that ad, otherwise when its plan is featured
drop view if exists public.public_jobs;
create view public.public_jobs as
select
  j.id, j.title, j.company, j.country, j.city, j.category,
  j.file_url, j.file_type, j.whatsapp, j.posted_date, j.starts_at, j.expires_at,
  coalesce(j.featured_override, pk.featured, false) as featured,
  coalesce(p.verified, false)  as recruiter_verified,
  j.thumb_url, j.details
from public.jobs j
left join public.profiles p  on p.id  = j.recruiter_id
left join public.packages pk on pk.id = j.package_id
where j.status = 'live' and j.expires_at > now();
revoke all on public.public_jobs from anon, authenticated;
grant select on public.public_jobs to anon, authenticated;

-- ===== THE price calculation: the only place a price is worked out =====
-- Returns a JSON answer: ok, code (a short word the website turns into plain text in the person's language), prices, bonus days.
create or replace function public.quote_price_for(p_recruiter uuid, p_package uuid, p_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg    public.packages;
  v_code   text := nullif(btrim(coalesce(p_code, '')), '');
  v_offer  public.offers;
  v_best   public.offers;
  v_best_v numeric := -1;
  v_v      numeric;
  o        public.offers;
  v_list   integer;
  v_days   integer;
  v_disc   integer := 0;
  v_bonus  integer := 0;
  v_final  integer;
  v_fail   text;
  v_applied boolean := false;

  -- how many times an offer was used in total / by this employer
  v_total  integer;
  v_mine   integer;
begin
  select * into v_pkg from public.packages where id = p_package;
  if not found or not v_pkg.active then
    return jsonb_build_object('ok', false, 'code', 'plan_unavailable');
  end if;
  v_list := v_pkg.price_paise;
  v_days := v_pkg.duration_days;

  if v_code is not null then
    select * into v_offer from public.offers where lower(coupon_code) = lower(v_code);
    if not found then v_fail := 'not_found';
    elsif not v_offer.active then v_fail := 'inactive';
    elsif v_offer.starts_at is not null and v_offer.starts_at > now() then v_fail := 'not_started';
    elsif v_offer.ends_at is not null and v_offer.ends_at <= now() then v_fail := 'expired';
    elsif v_offer.applies_to = 'package' and v_offer.package_id is distinct from p_package then v_fail := 'wrong_plan';
    elsif v_offer.applies_to = 'recruiter' and v_offer.recruiter_id is distinct from p_recruiter then v_fail := 'wrong_recruiter';
    else
      select count(*) into v_total from public.offer_redemptions where offer_id = v_offer.id;
      select count(*) into v_mine from public.offer_redemptions where offer_id = v_offer.id and recruiter_id = p_recruiter;
      if v_offer.max_uses is not null and v_total >= v_offer.max_uses then v_fail := 'used_up';
      elsif v_mine >= v_offer.max_uses_per_recruiter then v_fail := 'already_used';
      end if;
    end if;
    if v_fail is not null then
      return jsonb_build_object('ok', false, 'code', v_fail, 'list_price_paise', v_list, 'discount_paise', 0, 'final_price_paise', v_list,
                                'bonus_days', 0, 'base_days', v_days, 'final_days', v_days);
    end if;
    v_best := v_offer;
  else
    -- no code: the single best automatic offer (never several together)
    for o in
      select * from public.offers f
       where f.active and f.coupon_code is null
         and (f.starts_at is null or f.starts_at <= now())
         and (f.ends_at is null or f.ends_at > now())
         and (f.applies_to = 'all'
              or (f.applies_to = 'package' and f.package_id = p_package)
              or (f.applies_to = 'recruiter' and f.recruiter_id = p_recruiter))
         and (f.max_uses is null or (select count(*) from public.offer_redemptions r where r.offer_id = f.id) < f.max_uses)
         and (select count(*) from public.offer_redemptions r where r.offer_id = f.id and r.recruiter_id = p_recruiter) < f.max_uses_per_recruiter
       order by f.created_at desc
    loop
      v_v := case o.type
               when 'percent' then v_list * o.value / 100.0
               when 'flat' then least(o.value, v_list)
               when 'free' then v_list
               else v_list::numeric / v_days * o.value          -- bonus days: worth the daily price of the plan
             end;
      if v_v > v_best_v then
        v_best_v := v_v;
        v_best := o;
      end if;
    end loop;
  end if;

  if v_best.id is not null then
    v_applied := true;
    case v_best.type
      when 'percent' then v_disc := round(v_list * v_best.value / 100.0)::integer;
      when 'flat' then v_disc := least(v_best.value::integer, v_list);
      when 'free' then v_disc := v_list;
      when 'bonus_days' then v_bonus := v_best.value::integer;
    end case;
  end if;
  v_disc  := least(greatest(v_disc, 0), v_list);
  v_final := greatest(v_list - v_disc, 0);                      -- never below zero

  return jsonb_build_object(
    'ok', true,
    'code', case when v_applied then v_best.type else 'no_offer' end,
    'list_price_paise', v_list, 'discount_paise', v_disc, 'final_price_paise', v_final,
    'bonus_days', v_bonus, 'base_days', v_days, 'final_days', v_days + v_bonus,
    'offer_id', v_best.id, 'offer_name', v_best.name, 'offer_type', v_best.type, 'offer_value', v_best.value,
    'via_code', v_code is not null and v_applied,
    'percent', case when v_best.type = 'percent' then v_best.value end
  );
end;
$$;
revoke all on function public.quote_price_for(uuid, uuid, text) from public, anon, authenticated;

-- What the website calls: the quote for the logged-in employer.
create or replace function public.quote_price(p_package uuid, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in.' using errcode = '42501';
  end if;
  return public.quote_price_for(auth.uid(), p_package, p_coupon_code);
end;
$$;
revoke all on function public.quote_price(uuid, text) from public, anon;
grant execute on function public.quote_price(uuid, text) to authenticated;

-- Saves the order: the price snapshot on the ad, a waiting payment record, the offer use. A free total is paid at once.
create or replace function public.create_ad_order(p_job uuid, p_package uuid, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_q    jsonb;
  v_pay  uuid;
  v_final integer;
  v_offer uuid;
  v_name  text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Please log in.' using errcode = '42501';
  end if;
  if public.is_blocked() then
    raise exception 'Your account is blocked.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('create_ad_order'));     -- orders one after another, so offer limits cannot be beaten by two at once
  select * into v_job from public.jobs where id = p_job and recruiter_id = auth.uid() for update;
  if not found then
    raise exception 'Ad not found.' using errcode = 'P0002';
  end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;

  delete from public.offer_redemptions where job_id = p_job;     -- ordering again gives the earlier offer use back first
  v_q := public.quote_price_for(auth.uid(), p_package, p_coupon_code);
  if not (v_q ->> 'ok')::boolean then
    raise exception 'offer: %', v_q ->> 'code' using errcode = 'P0001';
  end if;
  if v_q ->> 'code' = 'plan_unavailable' then
    raise exception 'offer: plan_unavailable' using errcode = 'P0001';
  end if;
  v_final := (v_q ->> 'final_price_paise')::integer;
  v_offer := nullif(v_q ->> 'offer_id', '')::uuid;
  v_name  := v_q ->> 'offer_name';

  perform set_config('app.order_in_progress', 'on', true);
  update public.jobs set
    package_id = p_package,
    list_price_paise = (v_q ->> 'list_price_paise')::integer,
    discount_paise = (v_q ->> 'discount_paise')::integer,
    final_price_paise = v_final,
    offer_id = v_offer,
    duration_days_final = (v_q ->> 'final_days')::integer,
    price_paise_at_order = v_final,
    days_at_order = (v_q ->> 'final_days')::integer
   where id = p_job;
  perform set_config('app.order_in_progress', '', true);

  select id into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if v_pay is null then
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (p_job, auth.uid(), v_final, 'manual', 'created', '', (v_q ->> 'list_price_paise')::integer, (v_q ->> 'discount_paise')::integer, v_final, v_offer, (v_q ->> 'final_days')::integer)
    returning id into v_pay;
  else
    update public.payments set amount_paise = v_final, list_price_paise = (v_q ->> 'list_price_paise')::integer, discount_paise = (v_q ->> 'discount_paise')::integer,
           final_price_paise = v_final, offer_id = v_offer, duration_days_final = (v_q ->> 'final_days')::integer
     where id = v_pay;
  end if;

  if v_offer is not null then
    insert into public.offer_redemptions (offer_id, recruiter_id, job_id, discount_paise, bonus_days)
    values (v_offer, auth.uid(), p_job, (v_q ->> 'discount_paise')::integer, (v_q ->> 'bonus_days')::integer);
  end if;

  v_status := 'pending_payment';
  if v_final = 0 then
    update public.payments set status = 'paid', method = 'free_offer', note = left('Free offer: ' || coalesce(v_name, ''), 200) where id = v_pay;
    perform set_config('app.order_in_progress', 'on', true);
    update public.jobs set status = 'paid_pending_review' where id = p_job;
    perform set_config('app.order_in_progress', '', true);
    v_status := 'paid_pending_review';
  end if;

  return v_q || jsonb_build_object('job_status', v_status, 'payment_id', v_pay);
end;
$$;
revoke all on function public.create_ad_order(uuid, uuid, text) from public, anon;
grant execute on function public.create_ad_order(uuid, uuid, text) to authenticated;

-- ===== admin: approve and mark-paid now use the final saved price and days =====
create or replace function public.admin_approve_job(p_job uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  v_job  public.jobs;
  v_days integer;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('paid_pending_review', 'rejected') then
    raise exception 'This ad cannot be approved now.' using errcode = '23514';
  end if;
  v_days := coalesce(v_job.duration_days_final, v_job.days_at_order, (select duration_days from public.packages where id = v_job.package_id), 30);
  update public.jobs
     set status = 'live', starts_at = now(), expires_at = now() + make_interval(days => v_days), reject_reason = null
   where id = p_job
   returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'approve_job', p_job, v_days || ' days');
  return v_job;
end;
$$;

create or replace function public.admin_mark_paid(p_job uuid, p_amount_paise integer default null, p_note text default '', p_reference text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job     public.jobs;
  v_amount  integer;
  v_payment public.payments;
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then
    raise exception 'This ad is not waiting for payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(p_amount_paise, v_job.final_price_paise, v_job.price_paise_at_order, (select price_paise from public.packages where id = v_job.package_id), 0);
  select * into v_payment from public.payments where job_id = v_job.id and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = 'manual', amount_paise = v_amount, note = coalesce(p_note, ''), reference = v_ref
     where id = v_payment.id returning * into v_payment;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, reference, list_price_paise, discount_paise, final_price_paise, offer_id, duration_days_final)
    values (v_job.id, v_job.recruiter_id, v_amount, 'manual', 'paid', coalesce(p_note, ''), v_ref, v_job.list_price_paise, v_job.discount_paise, v_job.final_price_paise, v_job.offer_id, v_job.duration_days_final)
    returning * into v_payment;
  end if;
  update public.jobs set status = 'paid_pending_review' where id = v_job.id;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;

-- ===== admin: three actions on one ad =====
create or replace function public.admin_extend_job(p_job uuid, p_days integer, p_reason text)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare v_job public.jobs;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365.' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status not in ('live', 'hidden') or v_job.expires_at is null then
    raise exception 'Only a live or hidden ad can get more days.' using errcode = '23514';
  end if;
  update public.jobs set expires_at = greatest(expires_at, now()) + make_interval(days => p_days) where id = p_job returning * into v_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'extend_job', p_job, '+' || p_days || ' days: ' || left(btrim(p_reason), 200));
  return v_job;
end;
$$;

create or replace function public.admin_set_featured(p_job uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  update public.jobs set featured_override = p_featured where id = p_job;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'set_featured', p_job, p_featured::text);
end;
$$;

create or replace function public.admin_give_free_ad(p_job uuid, p_note text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
  v_pay public.payments;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(v_note) < 3 then raise exception 'Please write a note.' using errcode = '23514'; end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  select * into v_pay from public.payments where job_id = p_job and status = 'created' order by created_at desc limit 1 for update;
  if found then
    update public.payments set status = 'paid', method = 'complimentary', amount_paise = 0, discount_paise = coalesce(list_price_paise, 0), final_price_paise = 0, note = v_note
     where id = v_pay.id returning * into v_pay;
  else
    insert into public.payments (job_id, recruiter_id, amount_paise, method, status, note, list_price_paise, discount_paise, final_price_paise, duration_days_final)
    values (p_job, v_job.recruiter_id, 0, 'complimentary', 'paid', v_note, v_job.list_price_paise, coalesce(v_job.list_price_paise, 0), 0, v_job.duration_days_final)
    returning * into v_pay;
  end if;
  update public.jobs set status = 'paid_pending_review', discount_paise = coalesce(list_price_paise, 0), final_price_paise = 0 where id = p_job;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'give_free_ad', p_job, v_note);
  return v_pay;
end;
$$;

revoke all on function public.admin_extend_job(uuid, integer, text) from public, anon;
revoke all on function public.admin_set_featured(uuid, boolean) from public, anon;
revoke all on function public.admin_give_free_ad(uuid, text) from public, anon;
revoke all on function public.admin_approve_job(uuid) from public, anon;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_extend_job(uuid, integer, text) to authenticated;
grant execute on function public.admin_set_featured(uuid, boolean) to authenticated;
grant execute on function public.admin_give_free_ad(uuid, text) to authenticated;
grant execute on function public.admin_approve_job(uuid) to authenticated;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;
