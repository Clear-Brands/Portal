import { Card, Pill, fmtCount, fmtMoney } from '@/components/ui'
import type { Competition, Sprint } from '@/lib/data/programs'

/**
 * Display only — every number here was already ranked and summed by
 * v_competition_standings / v_sprint_team_standings / v_sprint_overall.
 */

function DateRange({ start, end }: { start: string; end: string }) {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <span className="text-[12.5px] text-muted">
      {fmt(start)} &ndash; {fmt(end)}
    </span>
  )
}

function Medal({ position }: { position: number }) {
  if (position === 1) return <span aria-hidden>🥇</span>
  if (position === 2) return <span aria-hidden>🥈</span>
  if (position === 3) return <span aria-hidden>🥉</span>
  return <span className="num text-muted">#{position}</span>
}

export function CompetitionCard({ competition, today }: { competition: Competition; today: string }) {
  const running = competition.endDate >= today
  const top = competition.standings.slice(0, 8)
  const rest = competition.standings.length - top.length

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
            Competition {competition.teamName ? `· ${competition.teamName}` : '· Everyone'}
          </p>
          <h3 className="mt-1 font-head text-[19px] leading-tight text-paper">{competition.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <DateRange start={competition.startDate} end={competition.endDate} />
            {running ? <Pill tone="closed">Running</Pill> : <Pill tone="neutral">Ended</Pill>}
            {!competition.visible ? <Pill tone="lost">Hidden</Pill> : null}
          </div>
        </div>
        <p className="text-right text-[12px] text-muted">
          Needs <span className="num text-paper">{fmtCount(competition.minCloses)}</span>{' '}
          {competition.minCloses === 1 ? 'close' : 'closes'} to qualify
        </p>
      </div>

      {top.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted">No closes yet in this window.</p>
      ) : (
        <ul className="mt-4 grid gap-1.5">
          {top.map((s) => (
            <li
              key={s.personId}
              className="flex items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13.5px]"
            >
              <span className="w-6 flex-none text-center">
                <Medal position={s.position} />
              </span>
              <span className={s.qualified ? 'flex-1 truncate text-paper' : 'flex-1 truncate text-muted'}>
                {s.personName}
                {s.teamName ? <span className="text-muted"> · {s.teamName}</span> : null}
              </span>
              <span className="num text-muted">
                {fmtCount(s.closes)} {s.closes === 1 ? 'close' : 'closes'}
              </span>
              <span className="num w-20 text-right text-paper">{fmtMoney(s.spiff, true)}</span>
              {s.qualified && s.prize ? (
                <span className="w-28 flex-none truncate text-right text-[12px] text-volt">{s.prize}</span>
              ) : !s.qualified ? (
                <span className="w-28 flex-none truncate text-right text-[12px] text-muted">
                  {s.closesToQualify} to go
                </span>
              ) : (
                <span className="w-28 flex-none" />
              )}
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? <p className="mt-2 text-[12px] text-muted">+{rest} more on the board</p> : null}
    </Card>
  )
}

export function SprintCard({ sprint, today }: { sprint: Sprint; today: string }) {
  const running = sprint.endDate >= today
  const teamPrizeFor = (position: number, teamId: string) =>
    sprint.sprintType === 'perteam'
      ? [sprint.teamPrizes[teamId]?.c1, sprint.teamPrizes[teamId]?.c2, sprint.teamPrizes[teamId]?.c3][position - 1]
      : [sprint.prizeTeam1, sprint.prizeTeam2, sprint.prizeTeam3][position - 1]

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
            Sprint · {sprint.teamIds.length} pods · {sprint.sprintType === 'perteam' ? 'Per-team prizes' : 'Winner takes the ladder'}
          </p>
          <h3 className="mt-1 font-head text-[19px] leading-tight text-paper">{sprint.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <DateRange start={sprint.startDate} end={sprint.endDate} />
            {running ? <Pill tone="closed">Running</Pill> : <Pill tone="neutral">Ended</Pill>}
            {!sprint.visible ? <Pill tone="lost">Hidden</Pill> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5">
        {sprint.teamStandings.map((t) => {
          const prize = t.position <= 3 ? teamPrizeFor(t.position, t.teamId) : undefined
          return (
            <div
              key={t.teamId}
              className="flex items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13.5px]"
            >
              <span className="w-6 flex-none text-center">
                <Medal position={t.position} />
              </span>
              <span aria-hidden className="h-2 w-2 flex-none rounded-[2px]" style={{ background: t.teamColor }} />
              <span className="flex-1 truncate text-paper">{t.teamName}</span>
              <span className="num text-muted">
                {fmtCount(t.closes)} {t.closes === 1 ? 'close' : 'closes'}
              </span>
              <span className="num w-20 text-right text-paper">{fmtMoney(t.spiff, true)}</span>
              <span className="w-28 flex-none truncate text-right text-[12px] text-volt">{prize ?? ''}</span>
            </div>
          )
        })}
      </div>

      {sprint.overall.length > 0 ? (
        <>
          <p className="mt-4 mb-1.5 font-head text-[11px] tracking-[0.12em] text-muted uppercase">
            Top individuals across every pod
          </p>
          <ul className="grid gap-1.5">
            {sprint.overall.map((p) => (
              <li
                key={p.personId}
                className="flex items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[13.5px]"
              >
                <span className="w-6 flex-none text-center">
                  <Medal position={p.position} />
                </span>
                <span className="flex-1 truncate text-paper">
                  {p.personName}
                  {p.teamName ? <span className="text-muted"> · {p.teamName}</span> : null}
                </span>
                <span className="num text-muted">
                  {fmtCount(p.closes)} {p.closes === 1 ? 'close' : 'closes'}
                </span>
                <span className="num w-20 text-right text-paper">{fmtMoney(p.spiff, true)}</span>
                <span className="w-28 flex-none truncate text-right text-[12px] text-volt">
                  {sprint.sprintType === 'winner'
                    ? [sprint.prizeRep1, sprint.prizeRep2, sprint.prizeRep3][p.position - 1]
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sprint.prizeManager ? (
        <p className="mt-3 text-[12.5px] text-muted">Manager prize: {sprint.prizeManager}</p>
      ) : null}
    </Card>
  )
}
