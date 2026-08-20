-- 20_rls.sql
-- Row-level security assertions.
--
-- Each block impersonates a real seeded login and asserts what that person can
-- and cannot do. Every one of these corresponds to a finding from the review of
-- the original build; several of them PASS in the original only because the demo
-- data layer hid the behaviour.
--
-- Run by scripts/verify-migrations.sh and by CI on every change.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.sid(text) returns uuid
  language sql immutable as $$ select md5($1)::uuid $$;

create or replace function pg_temp.ok(p_label text, p_cond boolean) returns void
language plpgsql as $$
begin
  if p_cond then
    raise notice '  PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;

-- Impersonate a seeded login by email.
create or replace function pg_temp.become(p_email text) returns void
language plpgsql as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'No auth user for %', p_email; end if;
  -- Session scope, not transaction scope: psql autocommits each statement, so a
  -- transaction-local setting would evaporate before the next assertion runs.
  perform set_config('app.user_id', v::text, false);
end $$;

do $$ begin raise notice ''; raise notice 'FINDING 01 — a rep cannot set their own spiff'; end $$;

set role authenticated;
select pg_temp.become('jake@fieldpulse.com');

-- The honest path works and takes the partner's configured rate.
do $$
declare v_id uuid; v_spiff numeric;
begin
  v_id := public.submit_deal('Honest Referral Co', 'SEO');
  select spiff_amount into v_spiff from deals where id = v_id;
  perform pg_temp.ok('submit_deal sets the spiff from the partner rate ($250)', v_spiff = 250);
end $$;

-- The attack the original permitted: post a deal with your own spiff attached.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into deals (partner_id, person_id, client_name, service, status, spiff_amount)
    values (public.my_partner_id(), public.my_person_id(),
            'Payday Inc', 'SEO', 'submitted', 100000);
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.ok('a $100,000 self-assigned spiff is rejected', v_failed);
end $$;

-- And they cannot raise the spiff on a referral they already own.
do $$
declare v_spiff numeric;
begin
  update deals set spiff_amount = 99999
   where person_id = public.my_person_id() and status = 'submitted';
  select max(spiff_amount) into v_spiff
    from deals where person_id = public.my_person_id() and status = 'submitted';
  perform pg_temp.ok('editing a referral cannot raise its spiff', coalesce(v_spiff, 0) <= 250);
end $$;

-- Nor can they walk their own deal into payable.
do $$
declare v_failed boolean := false;
begin
  begin
    update deals set status = 'closed'
     where person_id = public.my_person_id() and status = 'submitted';
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a member cannot move their own referral to payable', v_failed);
end $$;

do $$ begin raise notice ''; raise notice 'FINDING 02 — leaderboards show everyone, deals do not'; end $$;

-- A rep still sees only their own deal rows...
do $$
declare v_others int;
begin
  select count(*) into v_others from deals where person_id <> public.my_person_id();
  perform pg_temp.ok('a member reads no other member''s deal rows', v_others = 0);
end $$;

-- ...but the podium is computed for the whole pod, which is the behaviour the
-- original could not deliver: every rep would have seen only themselves.
do $$
declare v_people int;
begin
  select count(distinct person_id) into v_people from v_podium_30;
  perform pg_temp.ok('the 30-day podium ranks the whole pod, not just me', v_people > 1);
end $$;

do $$
declare v_people int;
begin
  select count(distinct person_id) into v_people from v_competition_standings;
  perform pg_temp.ok('competition standings include other competitors', v_people > 1);
end $$;

-- A rep sees their own pod's podium and no one else's.
do $$
declare v_teams int;
begin
  select count(distinct team_id) into v_teams from v_podium_30;
  perform pg_temp.ok('a member sees exactly one pod''s podium — their own', v_teams = 1);
end $$;

do $$ begin raise notice ''; raise notice 'FINDING 03 — money totals are computed in SQL, not truncated at 1,000 rows'; end $$;

reset role;
select pg_temp.become('team@clearbrands.io');
set role authenticated;

do $$
declare v_payable numeric; v_direct numeric;
begin
  select payable_now into v_payable from v_partner_rollup where partner_id = pg_temp.sid('p_fp');
  select sum(spiff_amount) + sum(partner_comp) into v_direct
    from deals where partner_id = pg_temp.sid('p_fp') and status = 'closed';
  perform pg_temp.ok('rollup payable matches a direct sum ($' || v_payable || ')', v_payable = v_direct);
end $$;

do $$ begin raise notice ''; raise notice 'FINDING 04 — manager permissions are real, not cosmetic'; end $$;

reset role;
select pg_temp.become('jordan@clearbrands.io');   -- internal, access = manager
set role authenticated;

do $$
begin
  perform pg_temp.ok('a manager may work deals',            public.has_cap('deals.write'));
  perform pg_temp.ok('a manager may not record payouts',    not public.has_cap('payouts.write'));
  perform pg_temp.ok('a manager may not change rates',      not public.has_cap('rates.write'));
  perform pg_temp.ok('a manager may not write rev share',   not public.has_cap('revshare.write'));
end $$;

-- The original enforced my_can() on two tables only, so a manager with every box
-- unchecked could still do everything through the API. Here the write is refused.
do $$
declare v_failed boolean := false;
begin
  begin
    insert into payouts (partner_id, paid_date, period, reference, total, spiff_total, comp_total)
    values (pg_temp.sid('p_fp'), current_date, '2099-01', 'FORGED', 500, 500, 0);
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a manager cannot insert a payout directly', v_failed);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    perform public.record_payout(pg_temp.sid('p_fp'), 'FORGED-RPC');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a manager cannot call record_payout()', v_failed);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    update partners set default_spiff = 99999 where id = pg_temp.sid('p_fp');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a manager cannot change the default spiff',
    v_failed or (select default_spiff from partners where id = pg_temp.sid('p_fp')) = 250);
end $$;

do $$ begin raise notice ''; raise notice 'TENANCY — partners cannot see each other'; end $$;

reset role;
select pg_temp.become('partners@fieldpulse.com');
set role authenticated;

do $$
declare v_other int;
begin
  select count(*) into v_other from deals where partner_id <> pg_temp.sid('p_fp');
  perform pg_temp.ok('a partner admin reads no other partner''s deals', v_other = 0);

  select count(*) into v_other from people where partner_id <> pg_temp.sid('p_fp');
  perform pg_temp.ok('a partner admin reads no other partner''s roster', v_other = 0);

  select count(*) into v_other from v_partner_rollup where partner_id <> pg_temp.sid('p_fp');
  perform pg_temp.ok('a partner admin sees only their own rollup', v_other = 0);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    update partners set revshare_pct = 99 where id = pg_temp.sid('p_fp');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a partner admin cannot change their own rev-share rate',
    v_failed or (select revshare_pct from partners where id = pg_temp.sid('p_fp')) = 5);
end $$;

do $$ begin raise notice ''; raise notice 'LEDGER — recording and voiding a payout'; end $$;

reset role;
select pg_temp.become('team@clearbrands.io');   -- internal admin
set role authenticated;

do $$
declare
  v_payout uuid;
  v_before numeric;
  v_lines  int;
  v_traced int;
begin
  select payable_now into v_before from v_partner_rollup where partner_id = pg_temp.sid('p_fp');

  v_payout := public.record_payout(pg_temp.sid('p_fp'), 'ACH TEST-0001');
  perform pg_temp.ok('record_payout returns a batch id', v_payout is not null);

  perform pg_temp.ok('the batch total equals what was payable',
    (select total from payouts where id = v_payout) = v_before);

  select count(*) into v_lines from payout_lines where payout_id = v_payout;
  perform pg_temp.ok('the batch has line items (' || v_lines || ')', v_lines > 0);

  perform pg_temp.ok('nothing is payable immediately after',
    (select payable_now from v_partner_rollup where partner_id = pg_temp.sid('p_fp')) = 0);

  -- A second batch in the same month is refused by the database, not the browser.
  declare v_failed boolean := false;
  begin
    begin
      perform public.record_payout(pg_temp.sid('p_fp'), 'ACH TEST-0002');
    exception when others then v_failed := true;
    end;
    perform pg_temp.ok('a second payout in the same month is refused', v_failed);
  end;

  -- Void, and check the trail survives.
  perform public.void_payout(v_payout, 'Wrong ACH reference');

  perform pg_temp.ok('voiding returns the deals to payable',
    (select payable_now from v_partner_rollup where partner_id = pg_temp.sid('p_fp')) = v_before);

  select count(*) into v_traced from payout_lines where payout_id = v_payout and deal_id is not null;
  perform pg_temp.ok('the voided batch keeps its line items (' || v_traced || ')', v_traced > 0);

  perform pg_temp.ok('a voided batch drops out of lifetime paid',
    (select lifetime_paid from v_partner_rollup where partner_id = pg_temp.sid('p_fp')) = 14700);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    perform public.void_payout(pg_temp.sid('p1'), '');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('voiding without a reason is refused', v_failed);
end $$;

do $$ begin raise notice ''; raise notice 'AUDIT — the log is append-only'; end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    delete from activity where true;
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('nobody can delete activity rows', v_failed);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    update activity set text = 'rewritten' where true;
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('nobody can rewrite activity rows', v_failed);
end $$;

do $$
declare v_failed boolean := false;
begin
  begin
    delete from payouts where id = pg_temp.sid('p1');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('nobody can delete a payout', v_failed);
end $$;

do $$ begin raise notice ''; raise notice 'DEACTIVATION — a paused member is refused, not merely hidden'; end $$;

reset role;
update people set active = false where id = pg_temp.sid('r1');
select pg_temp.become('jake@fieldpulse.com');
set role authenticated;

do $$
declare v_deals int; v_failed boolean := false;
begin
  perform pg_temp.ok('a deactivated member holds no capabilities', not public.has_cap('spiffs.view'));
  select count(*) into v_deals from deals;
  perform pg_temp.ok('a deactivated member reads no deals at all', v_deals = 0);
  begin
    perform public.submit_deal('Should Not Work');
  exception when others then v_failed := true;
  end;
  perform pg_temp.ok('a deactivated member cannot submit', v_failed);
end $$;

reset role;
update people set active = true where id = pg_temp.sid('r1');

do $$ begin raise notice ''; raise notice 'All RLS assertions passed.'; raise notice ''; end $$;
