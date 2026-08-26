import { Card, Pill, fmtCount, fmtDate, fmtMoney } from '@/components/ui'
import type { Competition, Sprint } from '@/lib/data/programs'
import { CloseSprintButton, ReopenSprintButton } from './sprint-controls'

/**
 * Display only — every number here was already ranked and summed by
 * v_competition_standings / v_sprint_pod_standings / v_sprint_rep_standings.
 */

function DateRange({ start, end }: { start: string; end: string }) {
  return (
    <span className="text-[12.5px] text-muted">
      {fmtDate(start)} &ndash; {fmtDate(end)}
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

/** The prize(s) a given rep earns — their pod-rank tier, plus the sprint-wide
 *  "top rep, top pod" prize if they also happen to hold #1 on the #1 pod. */
function repPrizes(sprint: Sprint, podPosition: number, repPosition: number): string[] {
  const tierEnabled = [sprint.podRep1Enabled, sprint.podRep2Enabled, sprint.podRep3Enabled][repPosition - 1]
  const tierPrize = [sprint.podRep1Prize, sprint.podRep2Prize, sprint.podRep3Prize][repPosition - 1]
  const prizes: string[] = []
  if (tierEnabled && tierPrize) prizes.push(tierPrize)
  if (sprint.topRepTopPodEnabled && sprint.topRepTopPodPrize && podPosition === 1 && repPosition === 1) {
    prizes.push(sprint.topRepTopPodPrize)
  }
  return prizes
}

export function SprintCard({ sprint, canManage }: { sprint: Sprint; canManage: boolean }) {
  const isClosed = sprint.closedAt !== null
  const topPod = sprint.podStandings.find((p) => p.position === 1) ?? null

  const activeSlots = [
    sprint.podRep1Enabled && sprint.podRep1Prize ? `1st pod rep — ${sprint.podRep1Prize}` : null,
    sprint.podRep2Enabled && sprint.podRep2Prize ? `2nd pod rep — ${sprint.podRep2Prize}` : null,
    sprint.podRep3Enabled && sprint.podRep3Prize ? `3rd pod rep — ${sprint.podRep3Prize}` : null,
    sprint.podManagerEnabled && sprint.podManagerPrize ? `Pod manager — ${sprint.podManagerPrize}` : null,
    sprint.topRepTopPodEnabled && sprint.topRepTopPodPrize ? `Top rep, top pod — ${sprint.topRepTopPodPrize}` : null,
    sprint.topPodManagerEnabled && sprint.topPodManagerPrize ? `Top pod manager — ${sprint.topPodManagerPrize}` : null,
  ].filter((s): s is string => Boolean(s))

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
            Sprint · {sprint.teamIds.length} pods
          </p>
          <h3 className="mt-1 font-head text-[19px] leading-tight text-paper">{sprint.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <DateRange start={sprint.startDate} end={sprint.endDate} />
            {isClosed ? <Pill tone="neutral">Closed</Pill> : <Pill tone="closed">Running</Pill>}
            {!sprint.visible ? <Pill tone="lost">Hidden</Pill> : null}
          </div>
          {activeSlots.length > 0 ? (
            <p className="mt-2 max-w-[52ch] text-[12px] text-muted">{activeSlots.join(' · ')}</p>
          ) : (
            <p className="mt-2 text-[12px] text-muted">No prizes configured yet.</p>
          )}
        </div>
        {canManage ? (
          isClosed ? (
            <ReopenSprintButton sprintId={sprint.id} sprintName={sprint.name} />
          ) : (
            <CloseSprintButton
              sprintId={sprint.id}
              sprintName={sprint.name}
              leadingPodName={topPod?.teamName ?? null}
            />
          )
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        {sprint.podStandings.map((pod) => {
          const reps = sprint.repStandingsByPod[pod.teamId] ?? []
          const isTopPod = pod.position === 1
          const managerLines = [
            sprint.podManagerEnabled && sprint.podManagerPrize
              ? { prize: sprint.podManagerPrize, label: 'Pod manager' }
              : null,
            isTopPod && sprint.topPodManagerEnabled && sprint.topPodManagerPrize
              ? { prize: sprint.topPodManagerPrize, label: 'Top pod manager' }
              : null,
          ].filter((m): m is { prize: string; label: string } => Boolean(m))

          return (
            <div key={pod.teamId} className="rounded-[8px] border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-2.5">
                <span className="w-5 flex-none text-center">
                  <Medal position={pod.position} />
                </span>
                <span aria-hidden className="h-2 w-2 flex-none rounded-[2px]" style={{ background: pod.teamColor }} />
                <span className="flex-1 truncate font-head text-[12px] tracking-[0.05em] text-paper uppercase">
                  {pod.teamName}
                </span>
                <span className="num text-[12px] text-muted">
                  {fmtCount(pod.closes)} {pod.closes === 1 ? 'close' : 'closes'} · {fmtMoney(pod.spiff, true)}
                </span>
              </div>

              {reps.length === 0 ? (
                <p className="mt-2.5 text-[12.5px] text-muted">No closes yet in this window.</p>
              ) : (
                <ul className="mt-2.5 grid gap-1.5">
                  {reps
                    .filter((r) => r.position <= 3)
                    .map((r) => {
                      const prizes = repPrizes(sprint, pod.position, r.position)
                      return (
                        <li
                          key={r.personId}
                          className="flex items-center gap-3 rounded-[7px] bg-ink/40 px-2.5 py-1.5 text-[13px]"
                        >
                          <span className="w-5 flex-none text-center">
                            <Medal position={r.position} />
                          </span>
                          <span className="flex-1 truncate text-paper">{r.personName}</span>
                          <span className="num text-muted">
                            {fmtCount(r.closes)} {r.closes === 1 ? 'close' : 'closes'}
                          </span>
                          <span className="w-40 flex-none truncate text-right text-[12px] text-volt">
                            {prizes.join(' + ')}
                          </span>
                        </li>
                      )
                    })}
                </ul>
              )}

              {managerLines.length > 0 ? (
                <div className="mt-2.5 grid gap-1">
                  {managerLines.map((m) => (
                    <p key={m.label} className="text-[12px] text-muted">
                      {m.label}: <span className="text-volt">{m.prize}</span>
                      {pod.managerNames.length > 0 ? ` — ${pod.managerNames.join(', ')}` : ''}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
