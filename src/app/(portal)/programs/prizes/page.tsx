import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listPrizeLines, PRIZE_STATUS_LABEL, type PrizeStatus } from '@/lib/data/programs'
import { Button, Card, Eyebrow, Pill, SectionHeading } from '@/components/ui'
import { GoalAwardButton } from '../goal-award-button'

export const metadata = { title: 'Prizes' }

const STATUS_TONE: Record<PrizeStatus, string> = {
  leading: 'in_talks',
  locked_in: 'closed',
  awaiting_approval: 'neutral',
  approved: 'paid',
}

const SOURCE_LABEL: Record<string, string> = {
  competition: 'Competition',
  sprint_team: 'Sprint · pod',
  sprint_rep: 'Sprint · rep',
  sprint_manager: 'Sprint · manager',
  annual_goal: 'Closers Club',
}

export default async function PrizesPage() {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const canExport = can(profile, 'exports.run')
  const canApprove = can(profile, 'payouts.write')

  const lines = await listPrizeLines()
  const order: PrizeStatus[] = ['awaiting_approval', 'leading', 'locked_in', 'approved']
  const sorted = [...lines].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>{partner?.name ?? 'Programs'}</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Prizes</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
            Who is owed what, across every competition, sprint and Closers Club.
          </p>
        </div>
        {canExport && sorted.length > 0 ? (
          <Button variant="ghost" size="sm">
            <a href="/api/export/prizes">Export for Excel</a>
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <Card>
          <p className="text-[14px] text-muted">Nobody is in prize position yet.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-2.5 sm:hidden">
            {sorted.map((line, i) => (
              <Card key={i}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-muted uppercase">{SOURCE_LABEL[line.source]}</div>
                    <div className="truncate text-paper">{line.sourceName}</div>
                  </div>
                  <Pill tone={STATUS_TONE[line.status]}>{PRIZE_STATUS_LABEL[line.status]}</Pill>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13.5px]">
                  <div>
                    <span className="text-paper">{line.personName}</span>
                    {line.teamName && line.source !== 'sprint_team' ? (
                      <span className="text-muted"> · {line.teamName}</span>
                    ) : null}
                  </div>
                  <span className="text-volt">{line.prize}</span>
                </div>

                {canApprove && line.status === 'awaiting_approval' && line.goalId && line.personId ? (
                  <div className="mt-3 flex justify-end border-t border-line pt-3">
                    <GoalAwardButton
                      goalId={line.goalId}
                      personId={line.personId}
                      personName={line.personName}
                      prize={line.prize}
                      closes={line.closes ?? 0}
                      target={line.target ?? 0}
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>

          <Card className="hidden sm:block">
            <SectionHeading>Prize list</SectionHeading>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="pb-2.5 pr-3 font-head text-[11px] tracking-[0.1em] uppercase">Program</th>
                    <th className="pb-2.5 pr-3 font-head text-[11px] tracking-[0.1em] uppercase">Who</th>
                    <th className="pb-2.5 pr-3 font-head text-[11px] tracking-[0.1em] uppercase">Prize</th>
                    <th className="pb-2.5 pr-3 font-head text-[11px] tracking-[0.1em] uppercase">Status</th>
                    {canApprove ? <th className="pb-2.5 font-head text-[11px] tracking-[0.1em] uppercase" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((line, i) => (
                    <tr key={i} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 pr-3 text-muted">
                        {SOURCE_LABEL[line.source]}
                        <div className="text-paper">{line.sourceName}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-paper">
                        {line.personName}
                        {line.teamName && line.source !== 'sprint_team' ? (
                          <span className="text-muted"> · {line.teamName}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-volt">{line.prize}</td>
                      <td className="py-2.5 pr-3">
                        <Pill tone={STATUS_TONE[line.status]}>{PRIZE_STATUS_LABEL[line.status]}</Pill>
                      </td>
                      {canApprove ? (
                        <td className="py-2.5 text-right">
                          {line.status === 'awaiting_approval' && line.goalId && line.personId ? (
                            <GoalAwardButton
                              goalId={line.goalId}
                              personId={line.personId}
                              personName={line.personName}
                              prize={line.prize}
                              closes={line.closes ?? 0}
                              target={line.target ?? 0}
                            />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
