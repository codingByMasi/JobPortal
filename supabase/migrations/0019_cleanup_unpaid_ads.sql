-- Jobs Abroad migration 0019
-- 21. Ads that waited for payment for more than 30 days are removed by the daily clean-up.
--     Their waiting payment and offer use go with them (migration 0018 triggers and foreign keys).
--     Their picture files are NOT removed here (Supabase does not allow deleting stored files from SQL);
--     Admin > Problems > "Look for unused files" finds and removes them.
create or replace function public.cleanup_old_data()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.applications where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from public.error_log where last_at < now() - interval '30 days';
  delete from public.jobs where status = 'pending_payment' and created_at < now() - interval '30 days';
  return n;
end;
$$;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;
