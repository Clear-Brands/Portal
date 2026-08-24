import { Card, Pill, SectionHeading, fmtCount, fmtDate } from '@/components/ui'
import type { AnnualGoal } from '@/lib/data/programs'
import { GoalAwardButton } from './goal-award-button'

/** Progress bars for the whole roster against one target, with approval state. */
export function AnnualGoalsSection({ goals, canApprove }: { goals: AnnualGoal[]; canApprove: boolean }) {
  if (goals.length === 0) return null

  return (
    <section className="mt-10">
      <div className="mb-3">
        <SectionHeading>Closers Club</SectionHeading>
      </div>

      <div className="grid gap-4">
        {goals.map((goal) => {
          const achievers = goal.standings.filter((s) => s.achieved)
          const inProgress = goal.standings
            .filter((s) => !s.achieved)
            .sort((a, b) => a.remaining - b.remaining)
            .slice(0, 5)

          return (
            <Card key={goal.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
                    {goal.teamNames.length > 0 ? goal.teamNames.join(', ') : 'Everyone'} ·{' '}
                    {fmtDate(goal.startDate)} &ndash; {fmtDate(goal.endDate)}
                  </p>
                  <h3 className="mt-1 font-head text-[19px] leading-tight text-paper">
                    {fmtCount(goal.target)} closes &rarr; {goal.prize || 'prize not set'}
                  </h3>
                </div>
              </div>

              {achievers.length > 0 ? (
                <ul className="mt-4 grid gap-1.5">
                  {achievers.map((s) => (
                    <li
                      key={s.personId}
                      className="flex flex-wrap items-center gap-3 rounded-[8px] border border-volt/30 bg-volt-dim px-3 py-2 text-[13.5px]"
                    >
                      <span className="flex-1 truncate text-paper">{s.personName}</span>
                      <span className="num text-muted">{fmtCount(s.closes)} closes</span>
                      {s.approved ? (
                        <Pill tone="closed">Approved</Pill>
                      ) : (
                        <>
                          <Pill tone="neutral">Awaiting approval</Pill>
                          {canApprove ? (
                            <GoalAwardButton
                              goalId={goal.id}
                              personId={s.personId}
                              personName={s.personName}
                              prize={goal.prize}
                              closes={s.closes}
                              target={goal.target}
                            />
                          ) : null}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              {inProgress.length > 0 ? (
                <div className="mt-4 grid gap-2.5">
                  {inProgress.map((s) => {
                    const pct = Math.min(100, Math.round((s.closes / Math.max(goal.target, 1)) * 100))
                    return (
                      <div key={s.personId}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-paper">{s.personName}</span>
                          <span className="num text-muted">
                            {fmtCount(s.closes)} / {fmtCount(goal.target)}
                          </span>
                        </div>
                        <div className="mt-1 h-[6px] overflow-hidden rounded-[3px] bg-surface-2">
                          <div className="h-full rounded-[3px] bg-volt" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {achievers.length === 0 && inProgress.length === 0 ? (
                <p className="mt-4 text-[13.5px] text-muted">No closes yet toward this goal.</p>
              ) : null}
            </Card>
          )
        })}
      </div>
    </section>
  )
}
