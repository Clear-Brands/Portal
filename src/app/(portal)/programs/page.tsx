import Link from 'next/link'
import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { listAnnualGoals, listCompetitions, listSprints } from '@/lib/data/programs'
import { Button, Card, Eyebrow } from '@/components/ui'
import { CompetitionCard, SprintCard } from './program-cards'
import { AnnualGoalsSection } from './annual-goals'

export const metadata = { title: 'Programs' }

export default async function ProgramsPage() {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const competitionsEnabled = partner?.competitionsEnabled ?? true
  const annualEnabled = partner?.annualEnabled ?? true
  // Direct-URL backstop for the nav gate in the portal layout — the nav item
  // covers both toggles at once, so this only blocks when neither is on.
  if (!competitionsEnabled && !annualEnabled) redirect('/')
  const today = await partnerToday()

  const [competitions, sprints, goals] = await Promise.all([
    competitionsEnabled ? listCompetitions() : Promise.resolve([]),
    competitionsEnabled ? listSprints() : Promise.resolve([]),
    annualEnabled ? listAnnualGoals() : Promise.resolve([]),
  ])

  const canManage = can(profile, 'programs.write')
  const canApprove = can(profile, 'payouts.write')

  // A competition is "past" once its end date has passed. A sprint's end date
  // is a target, not a cutoff — it only moves to "past" once an admin has
  // manually closed it (closeSprint), so the two use different signals here.
  type Card_ = { key: string; startDate: string; closed: boolean; node: React.ReactNode }
  const cards: Card_[] = [
    ...competitions.map((c) => ({
      key: `competition-${c.id}`,
      startDate: c.startDate,
      closed: c.endDate < today,
      node: <CompetitionCard key={c.id} competition={c} today={today} />,
    })),
    ...sprints.map((s) => ({
      key: `sprint-${s.id}`,
      startDate: s.startDate,
      closed: s.closedAt !== null,
      node: <SprintCard key={s.id} sprint={s} canManage={canManage} />,
    })),
  ].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  const running = cards.filter((c) => !c.closed)
  const past = cards.filter((c) => c.closed)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>{partner?.name ?? 'Programs'}</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Programs</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
            Competitions and sprints, ranked in the database so everyone sees the same board — a rep
            never opens a leaderboard containing only themselves.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="ghost" size="sm">
            <Link href="/programs/prizes">Prize list</Link>
          </Button>
          {canManage ? (
            <Button size="sm">
              <Link href="/programs/new">New program</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {competitionsEnabled ? (
        running.length === 0 && past.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">
              Nothing is running right now.{' '}
              {canManage ? (
                <>
                  <Link href="/programs/new" className="text-volt hover:underline">
                    Start a competition or sprint
                  </Link>
                  .
                </>
              ) : null}
            </p>
          </Card>
        ) : (
          <>
            {running.length > 0 ? (
              <section>
                <div className="grid gap-4">{running.map((c) => c.node)}</div>
              </section>
            ) : null}

            {past.length > 0 ? (
              <details className="mt-8">
                <summary className="cursor-pointer font-head text-[15px] tracking-[0.04em] text-paper uppercase">
                  Past ({past.length})
                </summary>
                <div className="mt-4 grid gap-4">{past.map((c) => c.node)}</div>
              </details>
            ) : null}
          </>
        )
      ) : null}

      {annualEnabled ? <AnnualGoalsSection goals={goals} canApprove={canApprove} /> : null}
    </>
  )
}
