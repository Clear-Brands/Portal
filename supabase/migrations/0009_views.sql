-- 0009_views.sql
-- Every aggregate the interface displays, computed in SQL.
--
-- This migration is where three separate findings stop being possible:
--
--  * Leaderboards. In the original, standings were computed in the browser from
--    the deals it could see — and a rep can only see their own deals. Every rep
--    would have opened a competition where they were the only competitor. These
--    views run as their owner, expose names and counts without exposing deal
--    rows, and do their own tenancy filtering.
--
--  * Silent truncation. Reads were "give me all the rows", capped at 1,000 by
--    PostgREST without an error, so money totals quietly went wrong past that.
--    Sums happen here now.
--
--  * Two definitions of "payable". The partners table summed spiffs only while
--    the dashboard summed spiffs plus the partner's cut, so the same partner
--    showed two numbers. There is one definition, below, and every screen reads it.

-- ---------------------------------------------------------------------------
-- Closes, normalised once.
-- ---------------------------------------------------------------------------
create view v_closes as
  select d.id            as deal_id,
         d.partner_id,
         d.person_id,
         pe.team_id,
         d.closed_at,
         d.spiff_amount,
         d.partner_comp,
         d.status
  from deals d
  join people pe on pe.id = d.person_id
  where d.status in ('closed','paid')
    and d.closed_at is not null;

comment on view v_closes is 'A close is a deal whose first invoice was paid. Paid batches stay closes.';

-- ---------------------------------------------------------------------------
-- The one definition of what a partner is owed.
-- ---------------------------------------------------------------------------
create view v_partner_rollup as
  select p.id as partner_id,
         p.name,
         p.archived_at,
         -- Payable = unpaid spiffs (when the spiff programme is on) + the
         -- partner's own unpaid cut. One formula, every screen.
         coalesce((select sum(case when p.spiffs_enabled then d.spiff_amount else 0 end)
                          + sum(d.partner_comp)
                   from deals d where d.partner_id = p.id and d.status = 'closed'), 0)::numeric(12,2)
           as payable_now,
         coalesce((select sum(po.total) from payouts po
                   where po.partner_id = p.id and po.voided_at is null), 0)::numeric(12,2)
           as lifetime_paid,
         (select count(*) from people pe where pe.partner_id = p.id and pe.active)  as active_people,
         (select count(*) from people pe where pe.partner_id = p.id)                as total_people,
         (select count(*) from teams t  where t.partner_id  = p.id)                 as team_count,
         (select count(*) from deals d  where d.partner_id  = p.id
            and d.status in ('submitted','in_talks'))                               as open_deals,
         (select count(*) from deals d  where d.partner_id  = p.id
            and d.status = 'closed')                                                as payable_deals
  from partners p
  where my_role() = 'internal' or p.id = my_partner_id();

-- ---------------------------------------------------------------------------
-- Per-person production. Replaces an O(people x deals) scan that ran on every
-- keystroke — 500 people against 5,000 deals was ~2.5M operations per render.
-- ---------------------------------------------------------------------------
create view v_person_stats as
  select pe.id            as person_id,
         pe.partner_id,
         pe.team_id,
         pe.name,
         pe.email,
         pe.kind,
         pe.active,
         t.name           as team_name,
         t.color          as team_color,
         coalesce(agg.deals_sent, 0)                    as deals_sent,
         coalesce(agg.closes, 0)                        as closes,
         case when coalesce(agg.deals_sent, 0) = 0 then 0
              else round(100.0 * agg.closes / agg.deals_sent, 1) end as close_ratio,
         coalesce(agg.spiff_earned, 0)::numeric(12,2)   as spiff_earned,
         coalesce(agg.spiff_payable, 0)::numeric(12,2)  as spiff_payable,
         coalesce(agg.open_deals, 0)                    as open_deals
  from people pe
  left join teams t on t.id = pe.team_id
  left join lateral (
    select count(*)                                                          as deals_sent,
           count(*) filter (where d.status in ('closed','paid'))             as closes,
           sum(d.spiff_amount) filter (where d.status = 'paid')              as spiff_earned,
           sum(d.spiff_amount) filter (where d.status = 'closed')            as spiff_payable,
           count(*) filter (where d.status in ('submitted','in_talks'))      as open_deals
    from deals d where d.person_id = pe.id
  ) agg on true
  where my_role() = 'internal' or pe.partner_id = my_partner_id();

-- ---------------------------------------------------------------------------
-- The rolling 30-day podium, per pod.
--
-- Visibility: Clear Brands and partner admins see every pod; a member sees only
-- their own pod's board, and only if they hold the grant.
-- ---------------------------------------------------------------------------
create view v_podium_30 as
  select *
  from (
    select c.partner_id,
           c.team_id,
           t.name  as team_name,
           t.color as team_color,
           c.person_id,
           pe.name as person_name,
           count(*)                          as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           rank() over (partition by c.partner_id, c.team_id
                        order by count(*) desc, sum(c.spiff_amount) desc, pe.name) as position
    from v_closes c
    join people pe on pe.id = c.person_id
    join teams  t  on t.id  = c.team_id
    where c.closed_at >= public.partner_today(c.partner_id) - 30
    group by c.partner_id, c.team_id, t.name, t.color, c.person_id, pe.name
  ) ranked
  where position <= 3
    and (
      my_role() = 'internal'
      or (my_role() = 'partner_admin' and partner_id = my_partner_id())
      or (my_role() = 'member' and partner_id = my_partner_id()
          and has_cap('podium.view')
          and team_id = (select team_id from people where id = my_person_id()))
    );

-- ---------------------------------------------------------------------------
-- Individual competition standings.
-- ---------------------------------------------------------------------------
create view v_competition_standings as
  select comp.id            as competition_id,
         comp.partner_id,
         comp.name          as competition_name,
         comp.min_closes,
         s.person_id,
         s.person_name,
         s.team_id,
         s.team_name,
         s.closes,
         s.spiff,
         s.position,
         (s.closes >= comp.min_closes)                        as qualified,
         greatest(comp.min_closes - s.closes, 0)              as closes_to_qualify,
         case when s.closes >= comp.min_closes then
           case s.position when 1 then comp.prize_1
                           when 2 then comp.prize_2
                           when 3 then comp.prize_3
                           else '' end
         else '' end                                          as prize
  from competitions comp
  join lateral (
    select c.person_id,
           pe.name as person_name,
           pe.team_id,
           t.name  as team_name,
           count(*)                           as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           rank() over (order by count(*) desc, sum(c.spiff_amount) desc, pe.name) as position
    from v_closes c
    join people pe on pe.id = c.person_id
    left join teams t on t.id = pe.team_id
    where c.partner_id = comp.partner_id
      and c.closed_at between comp.start_date and comp.end_date
      and (comp.team_id is null or pe.team_id = comp.team_id)
    group by c.person_id, pe.name, pe.team_id, t.name
  ) s on true
  where my_role() = 'internal'
     or (comp.partner_id = my_partner_id() and comp.visible and has_cap('competitions.view'));

-- ---------------------------------------------------------------------------
-- Sprint standings: by team, and overall across the participating teams.
-- ---------------------------------------------------------------------------
create view v_sprint_team_standings as
  select sp.id       as sprint_id,
         sp.partner_id,
         sp.name     as sprint_name,
         t.id        as team_id,
         t.name      as team_name,
         t.color     as team_color,
         coalesce(agg.closes, 0)                        as closes,
         coalesce(agg.spiff, 0)::numeric(12,2)          as spiff,
         rank() over (partition by sp.id
                      order by coalesce(agg.closes, 0) desc,
                               coalesce(agg.spiff, 0) desc, t.name) as position
  from sprints sp
  join teams t on t.id = any (sp.team_ids)
  left join lateral (
    select count(*) as closes, sum(c.spiff_amount) as spiff
    from v_closes c
    where c.team_id = t.id
      and c.closed_at between sp.start_date and sp.end_date
  ) agg on true
  where my_role() = 'internal'
     or (sp.partner_id = my_partner_id() and sp.visible and has_cap('competitions.view'));

create view v_sprint_overall as
  select *
  from (
    select sp.id     as sprint_id,
           sp.partner_id,
           c.person_id,
           pe.name   as person_name,
           pe.team_id,
           t.name    as team_name,
           count(*)                           as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           rank() over (partition by sp.id
                        order by count(*) desc, sum(c.spiff_amount) desc, pe.name) as position,
           sp.visible
    from sprints sp
    join v_closes c on c.partner_id = sp.partner_id
                   and c.team_id = any (sp.team_ids)
                   and c.closed_at between sp.start_date and sp.end_date
    join people pe on pe.id = c.person_id
    join teams  t  on t.id  = c.team_id
    group by sp.id, sp.partner_id, c.person_id, pe.name, pe.team_id, t.name, sp.visible
  ) ranked
  where position <= 3
    and (my_role() = 'internal'
         or (partner_id = my_partner_id() and visible and has_cap('competitions.view')));

-- ---------------------------------------------------------------------------
-- Annual goal standings, with the approval state of any queued prize.
-- ---------------------------------------------------------------------------
create view v_annual_goal_standings as
  select g.id        as goal_id,
         g.partner_id,
         g.target,
         g.prize,
         g.start_date,
         g.end_date,
         pe.id       as person_id,
         pe.name     as person_name,
         pe.team_id,
         coalesce(agg.closes, 0)                       as closes,
         (coalesce(agg.closes, 0) >= g.target)         as achieved,
         greatest(g.target - coalesce(agg.closes, 0), 0) as remaining,
         (ga.id is not null)                           as approved,
         ga.approved_at
  from annual_goals g
  join people pe on pe.partner_id = g.partner_id
                and pe.kind = 'rep'
                and (g.team_id is null or pe.team_id = g.team_id)
  left join lateral (
    select count(*) as closes
    from v_closes c
    where c.person_id = pe.id
      and c.closed_at between g.start_date and g.end_date
  ) agg on true
  left join goal_awards ga on ga.goal_id = g.id and ga.person_id = pe.id
  where my_role() = 'internal' or g.partner_id = my_partner_id();

-- ---------------------------------------------------------------------------
-- The batch waiting to be paid, itemised.
-- ---------------------------------------------------------------------------
create view v_payable_batch as
  select d.partner_id,
         d.id          as deal_id,
         d.client_name,
         d.person_id,
         pe.name       as person_name,
         pe.email      as person_email,
         pe.team_id,
         t.name        as team_name,
         case when p.spiffs_enabled then d.spiff_amount else 0 end::numeric(12,2) as spiff_amount,
         d.partner_comp,
         d.closed_at
  from deals d
  join people   pe on pe.id = d.person_id
  join partners p  on p.id  = d.partner_id
  left join teams t on t.id = pe.team_id
  where d.status = 'closed'
    and (my_role() = 'internal'
         or (d.partner_id = my_partner_id() and has_cap('payouts.view')));

-- ---------------------------------------------------------------------------
-- Grants. These views run as their owner and filter internally, which is what
-- lets a member read a leaderboard without reading anyone else's deals.
-- ---------------------------------------------------------------------------
grant select on
  v_closes, v_partner_rollup, v_person_stats, v_podium_30,
  v_competition_standings, v_sprint_team_standings, v_sprint_overall,
  v_annual_goal_standings, v_payable_batch
to authenticated;

-- v_closes is a building block, not a surface: it carries deal ids.
revoke select on v_closes from authenticated;
