import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  Eyebrow,
  Pill,
  SectionHeading,
  StatCard,
  fmtCount,
  fmtMoney,
} from '@/components/ui'

export const metadata = { title: 'Dashboard' }

/**
 * Every number on this page comes from a database view.
 *
 * The original computed all of it in the browser from a full download of every
 * deal, rep and payout — which is why it slowed to a crawl at roster scale, why
 * totals silently went wrong past a thousand rows, and why a rep's podium showed
 * only themselves. Reading v_partner_rollup and v_podium_30 makes all three
 * impossible rather than merely fixed.
 */
export default async function DashboardPage() {
  const profile = await requireSession()
  const supabase = await createClient()

  if (profile.role === 'member') {
    return <MemberDashboard profile={profile} />
  }

  const { data: rollups } = await supabase
    .from('v_partner_rollup')
    .select('*')
    .is('archived_at', null)
    .order('payable_now', { ascending: false })

  const rows = rollups ?? []
  const totals = rows.reduce(
    (acc, r) => ({
      payable: acc.payable + Number(r.payable_now ?? 0),
      paid: acc.paid + Number(r.lifetime_paid ?? 0),
      people: acc.people + Number(r.active_people ?? 0),
      open: acc.open + Number(r.open_deals ?? 0),
    }),
    { payable: 0, paid: 0, people: 0, open: 0 },
  )

  const isInternal = profile.role === 'internal'

  return (
    <>
      <Eyebrow>{isInternal ? 'The whole book' : 'The partnership at a glance'}</Eyebrow>
      <h1 className="mb-7 font-head text-[26px] leading-tight text-paper">
        {isInternal ? 'Every partner program' : 'Where things stand'}
      </h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={isInternal ? 'Payable everywhere' : 'Owed right now'}
          value={fmtMoney(totals.payable)}
          accent
          note={`${fmtCount(rows.reduce((n, r) => n + Number(r.payable_deals ?? 0), 0))} deals waiting`}
        />
        <StatCard label="Lifetime paid" value={fmtMoney(totals.paid)} />
        <StatCard label="Active people" value={fmtCount(totals.people)} />
        <StatCard label="In flight" value={fmtCount(totals.open)} note="Submitted or in talks" />
      </div>

      <section className="mt-9">
        <SectionHeading className="mb-3">
          {isInternal ? 'Partners' : 'Your program'}
        </SectionHeading>

        {rows.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">
              Nothing here yet. Once deals start coming in, this fills up.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  {['Partner', 'Pods', 'People', 'Open', 'Payable now', 'Lifetime paid'].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`border-b border-line-strong px-[22px] py-3 font-head text-[11px] tracking-[0.15em] text-muted uppercase ${
                          i > 1 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partner_id as string} className="hover:bg-white/[0.025]">
                    <td className="border-b border-line px-[22px] py-3.5 text-[14px] text-paper">
                      {r.name as string}
                    </td>
                    <td className="num border-b border-line px-[22px] py-3.5 text-[14px] text-muted">
                      {fmtCount(r.team_count as number)}
                    </td>
                    <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-muted">
                      {fmtCount(r.active_people as number)}
                    </td>
                    <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-muted">
                      {fmtCount(r.open_deals as number)}
                    </td>
                    <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-volt">
                      {fmtMoney(r.payable_now as number, true)}
                    </td>
                    <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-muted">
                      {fmtMoney(r.lifetime_paid as number, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <Podiums />
    </>
  )
}

/* -------------------------------------------------------------------------- */

async function MemberDashboard({
  profile,
}: {
  profile: Awaited<ReturnType<typeof requireSession>>
}) {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('v_person_stats')
    .select('*')
    .eq('person_id', profile.personId!)
    .maybeSingle()

  const showMoney = can(profile, 'spiffs.view')

  return (
    <>
      <Eyebrow>Your numbers</Eyebrow>
      <h1 className="mb-7 font-head text-[26px] leading-tight text-paper">
        Hello, {profile.name.split(' ')[0]}
      </h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {showMoney ? (
          <>
            <StatCard
              label="Payable now"
              value={fmtMoney(stats?.spiff_payable ?? 0)}
              accent
              note="On the next transfer"
            />
            <StatCard label="Earned to date" value={fmtMoney(stats?.spiff_earned ?? 0)} />
          </>
        ) : (
          <>
            <StatCard label="Closes" value={fmtCount(stats?.closes ?? 0)} accent />
            <StatCard label="In flight" value={fmtCount(stats?.open_deals ?? 0)} />
          </>
        )}
        <StatCard
          label="Deals sent"
          value={fmtCount(stats?.deals_sent ?? 0)}
          note={
            stats?.close_ratio != null ? (
              <>
                <span className="num">{String(stats.close_ratio)}%</span> close rate
              </>
            ) : undefined
          }
        />
      </div>

      <section className="mt-9">
        <SectionHeading className="mb-3">How it works</SectionHeading>
        <Card>
          <ol className="grid gap-3 text-[14px] text-muted">
            {[
              'Send a referral through Submit a deal — client name is all we need to start.',
              'Clear Brands takes it from there and moves it to In talks once they are engaged.',
              'When the client pays their first invoice, your deal becomes Payable.',
              'Payable deals go out in one transfer at the end of the month.',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="num font-head text-[13px] text-volt">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <Podiums />
    </>
  )
}

/* -------------------------------------------------------------------------- */

async function Podiums() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_podium_30')
    .select('*')
    .order('team_name')
    .order('position')

  const rows = data ?? []
  if (rows.length === 0) return null

  const byTeam = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.team_id as string
    byTeam.set(key, [...(byTeam.get(key) ?? []), row])
  }

  return (
    <section className="mt-9">
      <SectionHeading className="mb-1">Last 30 days</SectionHeading>
      <p className="mb-3 text-[12.5px] text-muted">Top three closers, counted per pod.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {[...byTeam.entries()].map(([teamId, members]) => (
          <Card key={teamId} className="border-t-2" style={{ borderTopColor: members[0]?.team_color as string }}>
            <p className="mb-3 font-head text-[12px] tracking-[0.15em] text-muted uppercase">
              {members[0]?.team_name as string}
            </p>
            <ol className="grid gap-2.5">
              {members.map((m) => (
                <li key={m.person_id as string} className="flex items-center gap-3">
                  <span className="num w-5 font-head text-[13px] text-volt">
                    {String(m.position)}
                  </span>
                  <span className="flex-1 text-[14px] text-paper">{m.person_name as string}</span>
                  <Pill tone="neutral">
                    <span className="num">{fmtCount(m.closes as number)}</span> closes
                  </Pill>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </section>
  )
}
