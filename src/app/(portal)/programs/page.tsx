import Link from 'next/link'

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
  const today = await partnerToday()

  const [competitions, sprints, goals] = await Promise.all([
    listCompetitions(),
    listSprints(),
    listAnnualGoals(),
  ])

  const canManage = can(profile, 'programs.write')
  const canApprove = can(profile, 'payouts.write')

  type Card_ = { key: string; startDate: string; endDate: string; node: React.ReactNode }
  const cards: Card_[] = [
    ...competitions.map((c) => ({
      key: `competition-${c.id}`,
      startDate: c.startDate,
      endDate: c.endDate,
      node: <CompetitionCard key={c.id} competition={c} today={today} />,
    })),
    ...sprints.map((s) => ({
      key: `sprint-${s.id}`,
      startDate: s.startDate,
      endDate: s.endDate,
      node: <SprintCard key={s.id} sprint={s} today={today} />,
    })),
  ].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  const running = cards.filter((c) => c.endDate >= today)
  const past = cards.filter((c) => c.endDate < today)

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

      {running.length === 0 && past.length === 0 ? (
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
      )}

      <AnnualGoalsSection goals={goals} canApprove={canApprove} />
    </>
  )
}
