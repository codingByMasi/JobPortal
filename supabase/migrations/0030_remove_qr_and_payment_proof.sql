-- 0030: employers do not pay by UPI/QR any more, so the QR picture and the payment proof (migration 0024) are removed.
-- Kept on purpose: the admin's payment tools (Payments, Packages, Offers, mark paid, free ad, refund) and the UPI settings keys.
-- Safety: stops if any payment proof exists, so nothing the admin might still need is dropped.
do $$
begin
  if exists (select 1 from public.payment_proofs) then
    raise exception 'Payment proofs exist: keep them and do not run this migration.';
  end if;
end;
$$;

-- admin_mark_paid no longer closes a proof (same behaviour as migration 0023 + the old rules)
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

-- the proof table and its two functions
drop function if exists public.submit_payment_proof(uuid, text, text);
drop function if exists public.admin_reject_proof(uuid, text);
drop table if exists public.payment_proofs;

-- the storage rules of the two buckets (the empty buckets themselves are removed below when Supabase allows it)
drop policy if exists "shop-assets admin all" on storage.objects;
drop policy if exists "payment-proofs read own or admin" on storage.objects;
drop policy if exists "payment-proofs upload own folder" on storage.objects;
drop policy if exists "payment-proofs delete own or admin" on storage.objects;
do $$
begin
  delete from storage.buckets where id in ('shop-assets', 'payment-proofs') and not exists (select 1 from storage.objects o where o.bucket_id = storage.buckets.id);
exception when others then
  -- Supabase may refuse a direct delete on its storage tables: then remove the two empty buckets in Dashboard > Storage by hand
  raise notice 'Could not delete the empty buckets shop-assets and payment-proofs here; delete them in Dashboard > Storage.';
end;
$$;

-- the QR picture setting
delete from public.site_settings where key = 'qr_path';
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
  check (key in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url'));
drop policy if exists "settings payee read" on public.site_settings;
create policy "settings payee read" on public.site_settings
  for select to authenticated using (key in ('upi_id', 'upi_name'));

create or replace function public.admin_save_settings(p_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v text;
  v_old text;
  v_detail text := '';
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Bad settings.' using errcode = '22023'; end if;
  for r in select key, btrim(value) as value from jsonb_each_text(p_values) loop
    v := r.value;
    if r.key not in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url') then
      raise exception 'setting: unknown' using errcode = '22023';
    end if;
    if r.key = 'whatsapp_number' then
      v := regexp_replace(v, '[^0-9]', '', 'g');
      if char_length(v) = 10 then v := '91' || v; end if;
    end if;
    if v <> '' and not (
         (r.key = 'whatsapp_number' and v ~ '^[0-9]{10,15}$')
      or (r.key = 'upi_id' and v ~ '^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9]{2,30}$')
      or (r.key in ('contact_email', 'grievance_email') and v ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(v) <= 120)
      or (r.key in ('upi_name', 'grievance_name', 'company_name') and char_length(v) between 2 and 80)
      or (r.key = 'site_url' and v ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{2,5})?$')
    ) then
      raise exception 'setting: %', r.key using errcode = '22023';
    end if;
    select value into v_old from public.site_settings where key = r.key;
    if v_old is distinct from v and not (v_old is null and v = '') then
      insert into public.site_settings (key, value, updated_at, updated_by) values (r.key, v, now(), auth.uid())
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
      v_detail := v_detail || r.key || ': ' || coalesce(v_old, '(empty)') || ' -> ' || coalesce(nullif(v, ''), '(empty)') || '; ';
    end if;
  end loop;
  if v_detail <> '' then
    insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'save_settings', null, left(v_detail, 500));
  end if;
end;
$$;
revoke all on function public.admin_save_settings(jsonb) from public, anon;
grant execute on function public.admin_save_settings(jsonb) to authenticated;
