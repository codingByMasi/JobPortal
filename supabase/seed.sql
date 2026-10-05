-- Jobs Abroad sample data. Safe to run more than once (adds packages only when there are none).

-- Placeholder packages: change prices in the Admin > Packages screen.
insert into public.packages (name, price_paise, duration_days, featured)
select * from (values
  ('7 Days',             29900::integer,  7, false),
  ('30 Days',            79900::integer, 30, false),
  ('30 Days Featured',  149900::integer, 30, true)
) as seed (name, price_paise, duration_days, featured)
where not exists (select 1 from public.packages);
