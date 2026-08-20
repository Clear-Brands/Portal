-- 10_sanity.sql
-- Shape checks on the seeded database. Fast, and they catch a migration that
-- applied without error but produced the wrong structure.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.ok(p_label text, p_cond boolean) returns void
language plpgsql as $$
begin
  if p_cond then raise notice '  PASS  %', p_label;
  else raise exception 'FAIL  %', p_label; end if;
end $$;

do $$
begin
  raise notice '';
  raise notice 'STRUCTURE';

  perform pg_temp.ok('every expected table exists',
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
        and table_name in ('partners','departments','teams','people','profiles','deals',
                           'payouts','payout_lines','revshare_statements','revshare_lines',
                           'competitions','sprints','annual_goals','goal_awards',
                           'activity','event_outbox','webhook_events')) = 17);

  perform pg_temp.ok('row-level security is on for every table',
    (select count(*) from pg_tables t
      join pg_class c on c.relname = t.tablename
      where t.schemaname = 'public' and not c.relrowsecurity) = 0);

  perform pg_temp.ok('every money column is numeric, never float',
    (select count(*) from information_schema.columns
      where table_schema = 'public'
        and column_name in ('spiff_amount','partner_comp','deal_value','monthly_value',
                            'total','base','amount','share','spiff_total','comp_total',
                            'default_spiff','comp_flat')
        and data_type <> 'numeric') = 0);

  perform pg_temp.ok('profiles is keyed to auth.users, not an email string',
    exists (select 1 from information_schema.table_constraints tc
            join information_schema.key_column_usage k
              on k.constraint_name = tc.constraint_name
            where tc.table_name = 'profiles' and tc.constraint_type = 'FOREIGN KEY'
              and k.column_name = 'user_id'));

  perform pg_temp.ok('a person''s email is unique per partner, not globally',
    exists (select 1 from pg_indexes
            where tablename = 'people' and indexdef like '%partner_id, email%'));

  raise notice '';
  raise notice 'SEED';

  perform pg_temp.ok('6 partners',            (select count(*) from partners) = 6);
  perform pg_temp.ok('118 people',            (select count(*) from people)   = 118);
  perform pg_temp.ok('6 deactivated people',  (select count(*) from people where not active) = 6);
  perform pg_temp.ok('36 deals',              (select count(*) from deals)    = 36);
  perform pg_temp.ok('13 payout batches',     (select count(*) from payouts)  = 13);
  perform pg_temp.ok('7 logins',              (select count(*) from profiles) = 7);

  perform pg_temp.ok('FieldPulse is owed $6,900',
    (select sum(spiff_amount) + sum(partner_comp) from deals
      where partner_id = md5('p_fp')::uuid and status = 'closed') = 6900);

  perform pg_temp.ok('FieldPulse has been paid $14,700 to date',
    (select sum(total) from payouts
      where partner_id = md5('p_fp')::uuid and voided_at is null) = 14700);

  perform pg_temp.ok('every payout total equals its parts',
    (select count(*) from payouts where total <> spiff_total + comp_total) = 0);

  perform pg_temp.ok('no lost deal is missing a reason',
    (select count(*) from deals where status = 'lost' and btrim(lost_reason) = '') = 0);

  perform pg_temp.ok('no closed or paid deal is missing a close date',
    (select count(*) from deals where status in ('closed','paid') and closed_at is null) = 0);

  raise notice '';
end $$;
