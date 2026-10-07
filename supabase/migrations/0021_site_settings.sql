-- Jobs Abroad migration 0021
-- ---------------------------------------------------------------------
-- 23. SITE SETTINGS THE ADMIN CAN CHANGE (no code change, no new build)
--     WhatsApp number, UPI ID and its name, contact email, complaints person and email, company name, site address.
--     - Public ones (WhatsApp, contact email, complaints person, company name, site address) are readable by everyone.
--     - The UPI ID and its name are readable by logged-in people only (employers need them to pay).
--     - Nobody writes the table directly: only admin_save_settings() does, checks every value and logs old and new value in admin_log.
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key check (key in ('whatsapp_number', 'upi_id', 'upi_name', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url')),
  value      text not null default '' check (char_length(value) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.site_settings enable row level security;

drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings
  for select to anon, authenticated
  using (key in ('whatsapp_number', 'contact_email', 'grievance_name', 'grievance_email', 'company_name', 'site_url'));
drop policy if exists "settings payee read" on public.site_settings;
create policy "settings payee read" on public.site_settings
  for select to authenticated using (key in ('upi_id', 'upi_name'));
drop policy if exists "settings admin read" on public.site_settings;
create policy "settings admin read" on public.site_settings
  for select using (public.is_admin());
revoke insert, update, delete, truncate on public.site_settings from anon, authenticated;

-- Saves a set of settings. Empty text clears a setting. A 10-digit WhatsApp number gets 91 in front.
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
