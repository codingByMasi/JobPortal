-- 0024: the admin's own payment QR picture, and payment proof from the employer (UTR number + screenshot) for the admin to check.
-- Nothing here marks an ad paid: the admin still checks the money in the bank / UPI app and uses "Mark paid".

-- ===== two storage buckets =====
-- shop-assets: PUBLIC to read (the QR picture is shown on the payment screen), only admins write. 1 MB, pictures only.
-- payment-proofs: PRIVATE; an employer writes in their own folder, reads their own files; admins read all. 3 MB, pictures and PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-assets', 'shop-assets', true, 1048576, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop-assets admin all" on storage.objects;
create policy "shop-assets admin all" on storage.objects
  for all to authenticated using (bucket_id = 'shop-assets' and public.is_admin()) with check (bucket_id = 'shop-assets' and public.is_admin());

drop policy if exists "payment-proofs read own or admin" on storage.objects;
create policy "payment-proofs read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "payment-proofs upload own folder" on storage.objects;
create policy "payment-proofs upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_blocked());
drop policy if exists "payment-proofs delete own or admin" on storage.objects;
create policy "payment-proofs delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ===== the QR picture is a site setting: qr_path = a file in shop-assets, readable by logged-in people like the UPI ID =====
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
  check (key in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url', 'qr_path'));
drop policy if exists "settings payee read" on public.site_settings;
create policy "settings payee read" on public.site_settings
  for select to authenticated using (key in ('upi_id', 'upi_name', 'qr_path'));

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
    if r.key not in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url', 'qr_path') then
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
      -- the QR picture must be a file that really exists in our own bucket
      or (r.key = 'qr_path' and v ~ '^qr/[0-9a-f-]{36}\.(png|jpg|webp)$'
          and exists (select 1 from storage.objects o where o.bucket_id = 'shop-assets' and o.name = v))
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

-- ===== payment proof: one per ad (sending again replaces it) =====
create table if not exists public.payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null unique references public.jobs (id) on delete cascade,
  recruiter_id  uuid not null references public.profiles (id) on delete cascade,
  reference     text not null check (reference ~ '^[A-Z0-9]{6,30}$'),
  file_path     text not null check (char_length(file_path) between 10 and 200),
  status        text not null default 'submitted' check (status in ('submitted', 'rejected', 'accepted')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one UTR number can back only one live proof (a rejected one frees it)
create unique index if not exists payment_proofs_reference_unique on public.payment_proofs (reference) where status <> 'rejected';
alter table public.payment_proofs enable row level security;
drop policy if exists "proofs read own or admin" on public.payment_proofs;
create policy "proofs read own or admin" on public.payment_proofs
  for select to authenticated using (recruiter_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.payment_proofs from anon, authenticated;
revoke all on public.payment_proofs from anon;

-- The employer sends the UTR number and the screenshot (already uploaded to their own folder).
create or replace function public.submit_payment_proof(p_job uuid, p_reference text, p_file_path text)
returns public.payment_proofs language plpgsql security definer set search_path = public as $$
declare
  v_job   public.jobs;
  v_ref   text := upper(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9]', '', 'g'));
  v_proof public.payment_proofs;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if public.is_blocked() then raise exception 'This account is blocked.' using errcode = '42501'; end if;
  select * into v_job from public.jobs where id = p_job and recruiter_id = auth.uid() for update;
  if not found then raise exception 'Ad not found.' using errcode = 'P0002'; end if;
  if v_job.status <> 'pending_payment' then raise exception 'This ad is not waiting for payment.' using errcode = '23514'; end if;
  if v_ref !~ '^[A-Z0-9]{6,30}$' then raise exception 'proof: reference' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where upper(reference) = v_ref) then raise exception 'proof: reference_used' using errcode = '23505'; end if;
  if (storage.foldername(p_file_path))[1] is distinct from auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'payment-proofs' and o.name = p_file_path) then
    raise exception 'proof: file' using errcode = '22023';
  end if;
  insert into public.payment_proofs (job_id, recruiter_id, reference, file_path)
  values (p_job, auth.uid(), v_ref, p_file_path)
  on conflict (job_id) do update
    set reference = excluded.reference, file_path = excluded.file_path, status = 'submitted', reject_reason = null, updated_at = now()
  returning * into v_proof;
  return v_proof;
end;
$$;
revoke all on function public.submit_payment_proof(uuid, text, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;

-- The admin did not find the money: the proof is rejected with a reason the employer reads.
create or replace function public.admin_reject_proof(p_proof uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Only admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 1 then raise exception 'Please write a reason.' using errcode = '23514'; end if;
  select status into v_status from public.payment_proofs where id = p_proof for update;
  if not found then raise exception 'Proof not found.' using errcode = 'P0002'; end if;
  if v_status <> 'submitted' then raise exception 'This proof cannot be rejected now.' using errcode = '23514'; end if;
  update public.payment_proofs set status = 'rejected', reject_reason = left(btrim(p_reason), 300), updated_at = now() where id = p_proof;
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'reject_proof', p_proof, left(btrim(p_reason), 300));
end;
$$;
revoke all on function public.admin_reject_proof(uuid, text) from public, anon;
grant execute on function public.admin_reject_proof(uuid, text) to authenticated;

-- Marking an ad paid closes its open proof as accepted.
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
  update public.payment_proofs set status = 'accepted', updated_at = now() where job_id = p_job and status = 'submitted';
  insert into public.admin_log (admin_id, action, target_id, detail) values (auth.uid(), 'mark_paid', p_job, v_amount || ' paise');
  return v_payment;
end;
$$;
revoke all on function public.admin_mark_paid(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_mark_paid(uuid, integer, text, text) to authenticated;
