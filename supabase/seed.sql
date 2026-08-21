-- seed.sql
-- The demo dataset, ported from demoStore() in the original index.html.
--
-- Six partners, 118 people, 36 deals, 13 payout batches, a rev-share statement,
-- two competitions, a sprint and an annual goal. Dates are anchored the same way
-- the original was: every literal date shifts by (today - 2026-08-05) so the
-- fixture always looks current.
--
-- Deliberate corrections to the original fixture, each marked FIX below:
--   * Priya Nair manages the CS pod, so she is placed in it (the original's
--     normalisation pass dropped both managers into Sales).
--   * The lost deal carries a reason, which the schema now requires.
--   * The rev-share statement's client names and values match the deals they
--     came from, instead of a separate set that disagreed with them.

begin;

-- Stable ids from readable slugs, so foreign keys stay legible below.
create or replace function pg_temp.sid(text) returns uuid
  language sql immutable as $$ select md5($1)::uuid $$;

-- ---------------------------------------------------------------------------
-- Auth accounts for the demo logins.
--
-- On a local Supabase stack these become real sign-ins once you run
-- `npm run seed:auth`, which sets passwords through the admin API.
-- ---------------------------------------------------------------------------
do $$
declare
  v_emails text[] := array[
    'cristian@clearbrands.io','team@clearbrands.io','jordan@clearbrands.io',
    'partners@fieldpulse.com','marcus@fieldpulse.com','priya@fieldpulse.com',
    'jake@fieldpulse.com'
  ];
  e text;
begin
  foreach e in array v_emails loop
    begin
      insert into auth.users (id, email) values (pg_temp.sid('u_' || e), e)
      on conflict do nothing;
    exception when others then
      -- A real Supabase auth.users has more required columns; seed-auth.mjs
      -- creates these properly. Skipping here is expected in that case.
      null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Partners
-- ---------------------------------------------------------------------------
insert into partners (id, name, slug, default_spiff, revshare_pct, revshare_enabled, timezone) values
  (pg_temp.sid('p_fp'), 'FieldPulse',            'fieldpulse',   250, 5, true,  'America/New_York'),
  (pg_temp.sid('p_ac'), 'Acme Software',         'acme',         300, 0, false, 'America/New_York'),
  (pg_temp.sid('p_t1'), 'Titan Field Software',  'titan',        250, 0, true,  'America/New_York'),
  (pg_temp.sid('p_t2'), 'RoofCommand',           'roofcommand',  200, 0, true,  'America/New_York'),
  (pg_temp.sid('p_t3'), 'ServiceFlow CRM',       'serviceflow',  250, 0, true,  'America/New_York'),
  (pg_temp.sid('p_t4'), 'DispatchPro',           'dispatchpro',  300, 0, true,  'America/New_York');

-- ---------------------------------------------------------------------------
-- Departments and pods
-- ---------------------------------------------------------------------------
insert into departments (id, partner_id, name) values
  (pg_temp.sid('d_sales'), pg_temp.sid('p_fp'), 'Sales'),
  (pg_temp.sid('d_cs'),    pg_temp.sid('p_fp'), 'CS');

insert into teams (id, partner_id, department_id, name, color) values
  (pg_temp.sid('t_sales'), pg_temp.sid('p_fp'), pg_temp.sid('d_sales'), 'Sales Pod 1',         '#C8F52F'),
  (pg_temp.sid('t_cs'),    pg_temp.sid('p_fp'), pg_temp.sid('d_cs'),    'CS Pod 1',            '#4FC3F7'),
  (pg_temp.sid('t_ae'),    pg_temp.sid('p_ac'), null,                   'Account Executives',  '#FF8A65'),
  (pg_temp.sid('t_sup'),   pg_temp.sid('p_ac'), null,                   'Support',             '#BA68C8');

-- ---------------------------------------------------------------------------
-- People — named seeds
-- ---------------------------------------------------------------------------
insert into people (id, partner_id, team_id, name, email, kind, active) values
  -- FIX: Priya manages CS, so she sits in CS. The original put both managers in Sales.
  (pg_temp.sid('m1'), pg_temp.sid('p_fp'), pg_temp.sid('t_sales'), 'Marcus Hale',  'marcus@fieldpulse.com', 'manager', true),
  (pg_temp.sid('m2'), pg_temp.sid('p_fp'), pg_temp.sid('t_cs'),    'Priya Nair',   'priya@fieldpulse.com',  'manager', true),
  (pg_temp.sid('r1'), pg_temp.sid('p_fp'), pg_temp.sid('t_sales'), 'Jake Miller',  'jake@fieldpulse.com',   'rep',     true),
  (pg_temp.sid('r2'), pg_temp.sid('p_fp'), pg_temp.sid('t_sales'), 'Maria Santos', 'maria@fieldpulse.com',  'rep',     true),
  (pg_temp.sid('r3'), pg_temp.sid('p_fp'), pg_temp.sid('t_cs'),    'Chris Boyd',   'chris@fieldpulse.com',  'rep',     true),
  (pg_temp.sid('r4'), pg_temp.sid('p_fp'), pg_temp.sid('t_cs'),    'Dana Lee',     'dana@fieldpulse.com',   'rep',     true),
  (pg_temp.sid('a1'), pg_temp.sid('p_ac'), pg_temp.sid('t_ae'),    'Priya Shah',   'priya@acmesoftware.com','rep',     true),
  (pg_temp.sid('a2'), pg_temp.sid('p_ac'), pg_temp.sid('t_sup'),   'Tom Weller',   'tom@acmesoftware.com',  'rep',     true);

-- Pod managers
update teams set manager_ids = array[pg_temp.sid('m1')] where id = pg_temp.sid('t_sales');
update teams set manager_ids = array[pg_temp.sid('m2')] where id = pg_temp.sid('t_cs');
update departments set manager_ids = array[pg_temp.sid('m1')] where id = pg_temp.sid('d_sales');
update departments set manager_ids = array[pg_temp.sid('m2')] where id = pg_temp.sid('d_cs');

-- ---------------------------------------------------------------------------
-- People — the generated roster (56 sales + 54 CS), reproducing the original's
-- name arrays and modulo rules exactly so the fixture matches row for row.
-- ---------------------------------------------------------------------------
with names as (
  select array['Alex','Jordan','Taylor','Morgan','Casey','Riley','Sam','Drew','Reese','Quinn','Avery',
               'Blake','Cameron','Devon','Elliot','Frankie','Harper','Jesse','Kendall','Logan','Micah','Noel'] as f,
         array['Nguyen','Patel','Garcia','Kim','Okafor','Brooks','Turner','Rivera','Hayes','Cole',
               'Bennett','Ortiz','Marsh','Delgado','Foster','Iverson','Keller','Lopez','Mercer','Nash'] as l
),
gen as (
  -- Sales: n = i + 1, inactive when n % 17 = 0
  select 'g' || (i + 1) as slug,
         (select f[(i % 22) + 1] from names) || ' ' || (select l[((i * 7) % 20) + 1] from names) as name,
         i + 1 as n,
         'sales' as kind_of
  from generate_series(0, 55) i
  union all
  -- CS: n = i + 57, inactive when n % 19 = 0
  select 'g' || (i + 57),
         (select f[((i + 9) % 22) + 1] from names) || ' ' || (select l[((i * 11 + 3) % 20) + 1] from names),
         i + 57,
         'cs'
  from generate_series(0, 53) i
)
insert into people (id, partner_id, team_id, name, email, kind, active)
select pg_temp.sid(slug),
       pg_temp.sid('p_fp'),
       case kind_of when 'cs' then pg_temp.sid('t_cs') else pg_temp.sid('t_sales') end,
       name,
       lower(replace(name, ' ', '.')) || n || '@fieldpulse.com',
       'rep',
       case when kind_of = 'sales' then n % 17 <> 0 else n % 19 <> 0 end
from gen;

-- ---------------------------------------------------------------------------
-- Logins
-- ---------------------------------------------------------------------------
insert into profiles (user_id, partner_id, person_id, role, access, name, email)
select u.id, null, null, 'internal', v.access, v.name, v.email
from (values
  ('cristian@clearbrands.io', 'Cristian Droescher', 'admin'),
  ('team@clearbrands.io',     'Clear Brands Team',  'admin'),
  ('jordan@clearbrands.io',   'Jordan Wells',       'manager')
) as v(email, name, access)
join auth.users u on u.email = v.email;

insert into profiles (user_id, partner_id, person_id, role, access, name, email)
select u.id, pg_temp.sid('p_fp'), null, 'partner_admin', 'none', 'FieldPulse Admin', u.email
from auth.users u where u.email = 'partners@fieldpulse.com';

insert into profiles (user_id, partner_id, person_id, role, access, name, email)
select u.id, pg_temp.sid('p_fp'), pg_temp.sid(v.slug), 'member', 'none', v.name, u.email
from (values
  ('marcus@fieldpulse.com', 'm1', 'Marcus Hale'),
  ('priya@fieldpulse.com',  'm2', 'Priya Nair'),
  ('jake@fieldpulse.com',   'r1', 'Jake Miller')
) as v(email, slug, name)
join auth.users u on u.email = v.email;

-- ---------------------------------------------------------------------------
-- Deals
--
-- shift = today - 2026-08-05, applied to every literal date below.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.shift(d date) returns date
  language sql stable as $$ select $1 + (current_date - date '2026-08-05') $$;

insert into deals (id, partner_id, person_id, client_name, service, status, spiff_amount,
                   monthly_value, city, state, contact, promo_note, lost_reason,
                   created_at, closed_at)
values
  (pg_temp.sid('d1'), pg_temp.sid('p_fp'), pg_temp.sid('r1'), 'Summit Air & Heating',      'SEO',      'paid',      250, 2000, 'St. Petersburg','FL','Denise Wall',      '', '', pg_temp.shift('2026-05-12'), pg_temp.shift('2026-05-28')),
  (pg_temp.sid('d2'), pg_temp.sid('p_fp'), pg_temp.sid('r2'), 'Anchor Plumbing Co',        'Paid Ads', 'paid',      250, 3000, 'Clearwater',    'FL','Marty Blanchard', '', '', pg_temp.shift('2026-05-19'), pg_temp.shift('2026-06-03')),
  (pg_temp.sid('d3'), pg_temp.sid('p_fp'), pg_temp.sid('r1'), 'IronBay Garage Doors',      'Web Design','paid',     250,    0, '',              '',  '',                '', '', pg_temp.shift('2026-06-02'), pg_temp.shift('2026-06-18')),
  (pg_temp.sid('d4'), pg_temp.sid('p_fp'), pg_temp.sid('r3'), 'Gulf Coast Roofing',        'SEO',      'closed',    400, 2500, 'Tampa',         'FL','R. Okafor',       'July double-spiff promo', '', pg_temp.shift('2026-07-08'), pg_temp.shift('2026-07-24')),
  (pg_temp.sid('d5'), pg_temp.sid('p_fp'), pg_temp.sid('r2'), 'BrightFlow Irrigation',     'SEO',      'closed',    250, 2500, '',              '',  '',                '', '', pg_temp.shift('2026-07-15'), pg_temp.shift('2026-08-02')),
  (pg_temp.sid('d6'), pg_temp.sid('p_fp'), pg_temp.sid('r1'), 'Pelican Pressure Washing',  'Paid Ads', 'closed',    250,    0, '',              '',  '',                '', '', pg_temp.shift('2026-07-22'), pg_temp.shift('2026-08-03')),
  (pg_temp.sid('d7'), pg_temp.sid('p_fp'), pg_temp.sid('r4'), 'TruTemp Mechanical',        'SEO',      'submitted', 250,    0, '',              '',  '',                '', '', pg_temp.shift('2026-07-29'), null),
  (pg_temp.sid('d8'), pg_temp.sid('p_fp'), pg_temp.sid('r3'), 'Baywatch Home Inspections', 'LSA',      'in_talks',  250,    0, '',              '',  '',                '', '', pg_temp.shift('2026-08-01'), null),
  -- FIX: a lost deal must carry a reason now. The original left this blank.
  (pg_temp.sid('d9'), pg_temp.sid('p_fp'), pg_temp.sid('r2'), 'Coastal Gutter Pros',       'SEO',      'lost',      250,    0, '',              '',  '',                '', 'Went with an in-house marketer', pg_temp.shift('2026-06-20'), null),
  -- A deliberately stale referral, to exercise the "no movement in N days" warning.
  (pg_temp.sid('d_stale'), pg_temp.sid('p_fp'), pg_temp.sid('r2'), 'Legacy Lead Co',       'SEO',      'submitted', 250,    0, '',              '',  '',                '', '', current_date - 45, null),
  -- Acme
  (pg_temp.sid('ad1'), pg_temp.sid('p_ac'), pg_temp.sid('a1'), 'Lakeside Dental',          'SEO',      'closed',    300,    0, '',              '',  '',                '', '', pg_temp.shift('2026-07-28'), pg_temp.shift('2026-08-01')),
  (pg_temp.sid('ad2'), pg_temp.sid('p_ac'), pg_temp.sid('a2'), 'Redline Auto Glass',       'Paid Ads', 'submitted', 300,    0, '',              '',  '',                '', '', pg_temp.shift('2026-08-03'), null);

-- The 24-deal payable backlog, mapped 1:1 onto sales reps g1..g24.
insert into deals (id, partner_id, person_id, client_name, service, status, spiff_amount,
                   created_at, closed_at)
select pg_temp.sid('bl' || i),
       pg_temp.sid('p_fp'),
       pg_temp.sid('g' || i),
       'Backlog Client ' || i,
       (array['SEO','Web Design','LSA','Paid Ads'])[(i % 4) + 1],
       'closed',
       250,
       pg_temp.shift(('2026-06-' || lpad((10 + (i % 18))::text, 2, '0'))::date),
       pg_temp.shift(('2026-07-0' || (1 + (i % 5)))::date)
from generate_series(1, 24) i;

-- Insert stamps updated_at with now(), which would make every seeded deal look
-- like it moved a second ago and hide the "no movement in N days" warning.
-- Backdate it to the creation date so the stale referral actually reads as stale.
--
-- Triggers are off for this one statement: touch_updated_at() would otherwise
-- immediately stamp the value we are trying to set, and the activity log would
-- gain 36 meaningless "corrected" entries.
alter table deals disable trigger user;
update deals set updated_at = created_at;
alter table deals enable trigger user;

-- The three deals that were settled in the most recent batch are marked live for
-- rev share; the rest default to null (not yet live).
update deals set live = true
 where id in (pg_temp.sid('d1'), pg_temp.sid('d2'), pg_temp.sid('d4'));

-- ---------------------------------------------------------------------------
-- Payout history
-- ---------------------------------------------------------------------------
insert into payouts (id, partner_id, paid_date, period, reference, total, spiff_total, comp_total)
select pg_temp.sid('hp' || m),
       pg_temp.sid('p_fp'),
       (date '2025-07-01' + (m || ' months')::interval)::date,
       to_char(date '2025-07-01' + (m || ' months')::interval, 'YYYY-MM'),
       'ACH ' || (7000 + m),
       (250 + (m % 3) * 250) + (250 + ((m + 1) % 2) * 250) + (case when m % 4 = 0 then 400 else 250 end),
       (250 + (m % 3) * 250) + (250 + ((m + 1) % 2) * 250) + (case when m % 4 = 0 then 400 else 250 end),
       0
from generate_series(0, 11) m;

insert into payout_lines (payout_id, deal_id, person_id, kind, amount, person_name, team_name)
select pg_temp.sid('hp' || m), null, pg_temp.sid(v.slug), 'spiff', v.amt, v.nm, 'Sales Pod 1'
from generate_series(0, 11) m
cross join lateral (values
  ('r1', 'Jake Miller',  (250 + (m % 3) * 250)::numeric(12,2)),
  ('r2', 'Maria Santos', (250 + ((m + 1) % 2) * 250)::numeric(12,2)),
  ('r3', 'Chris Boyd',   (case when m % 4 = 0 then 400 else 250 end)::numeric(12,2))
) as v(slug, nm, amt);

-- The most recent batch, which actually settled d1, d2 and d3.
insert into payouts (id, partner_id, paid_date, period, reference, total, spiff_total, comp_total)
values (pg_temp.sid('p1'), pg_temp.sid('p_fp'), date '2026-07-01', '2026-07', 'ACH 8841-2207', 750, 750, 0);

insert into payout_lines (payout_id, deal_id, person_id, kind, amount, person_name, team_name, client_name)
select pg_temp.sid('p1'), d.id, d.person_id, 'spiff', d.spiff_amount, pe.name, t.name, d.client_name
from deals d
join people pe on pe.id = d.person_id
left join teams t on t.id = pe.team_id
where d.id in (pg_temp.sid('d1'), pg_temp.sid('d2'), pg_temp.sid('d3'));

update deals set payout_id = pg_temp.sid('p1')
 where id in (pg_temp.sid('d1'), pg_temp.sid('d2'), pg_temp.sid('d3'));

-- ---------------------------------------------------------------------------
-- Rev share
--
-- FIX: the original statement listed three clients whose values disagreed with
-- the deals they came from. This is derived from the deals themselves.
-- ---------------------------------------------------------------------------
insert into revshare_statements (id, partner_id, period, pct, base, total, reference)
select pg_temp.sid('rs1'), pg_temp.sid('p_fp'), '2026-07', 5,
       sum(monthly_value)::numeric(12,2),
       public.money_round(sum(monthly_value) * 5 / 100.0),
       'ACH RS-2607'
from deals
where id in (pg_temp.sid('d1'), pg_temp.sid('d2'), pg_temp.sid('d4'));

insert into revshare_lines (statement_id, deal_id, client_name, monthly_value, share)
select pg_temp.sid('rs1'), id, client_name, monthly_value,
       public.money_round(monthly_value * 5 / 100.0)
from deals
where id in (pg_temp.sid('d1'), pg_temp.sid('d2'), pg_temp.sid('d4'));

-- ---------------------------------------------------------------------------
-- Programmes
-- ---------------------------------------------------------------------------
insert into competitions (id, partner_id, team_id, name, start_date, end_date,
                          prize_1, prize_2, prize_3, min_closes, visible) values
  (pg_temp.sid('c1'), pg_temp.sid('p_fp'), null,
   'August Blitz', pg_temp.shift('2026-08-01'), pg_temp.shift('2026-08-31'),
   'Rolex Submariner', '$500', '$250', 2, true),
  (pg_temp.sid('c2'), pg_temp.sid('p_fp'), pg_temp.sid('t_cs'),
   'CS Referral Sprint', pg_temp.shift('2026-08-01'), pg_temp.shift('2026-08-31'),
   '$300', '', '', 1, true);

insert into sprints (id, partner_id, name, start_date, end_date, sprint_type, team_ids,
                     prize_rep_1, prize_rep_2, prize_manager, visible)
values (pg_temp.sid('sp1'), pg_temp.sid('p_fp'), 'Summer Showdown',
        current_date - 20, current_date + 20, 'winner',
        array[pg_temp.sid('t_sales'), pg_temp.sid('t_cs')],
        '$500', '$250', '$300 to the winning pod''s lead', true);

-- The original shipped no annual goal. One here makes the feature demonstrable.
insert into annual_goals (id, partner_id, team_id, start_date, end_date, target, prize)
values (pg_temp.sid('ag1'), pg_temp.sid('p_fp'), null,
        date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
        12, 'Trip to Cabo');

-- ---------------------------------------------------------------------------
-- A little narrative activity on top of what the triggers generated.
-- ---------------------------------------------------------------------------
insert into activity (partner_id, kind, text, actor_name, created_at) values
  (pg_temp.sid('p_fp'), 'team',    '14 members imported with logins',                        'Clear Brands Team', now() - interval '26 hours'),
  (pg_temp.sid('p_fp'), 'money',   'Payout recorded — $850 to FieldPulse (ref ACH 7013)',    'Clear Brands Team', now() - interval '31 hours'),
  (pg_temp.sid('p_fp'), 'program', 'Sprint launched — Summer Showdown (2 pods competing)',   'Clear Brands Team', now() - interval '52 hours'),
  (pg_temp.sid('p_fp'), 'team',    'Member added — Harper Marsh',                            'FieldPulse Admin',  now() - interval '75 hours');

commit;
