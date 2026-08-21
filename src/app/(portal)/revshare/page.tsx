import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import {
  accruingTotal,
  listLiveAccounts,
  listRevshareCandidates,
  listRevshareStatements,
  revshareHeadline,
  type LiveAccount,
} from '@/lib/data/revshare'
import { Card, Eyebrow, Pill, SectionHeading, fmtCount, fmtMoney } from '@/components/ui'
import {
  AddToProgrammeButton,
  MarkChurnedButton,
  MarkLiveButton,
  RecordRevshareButton,
  VoidRevshareButton,
} from './revshare-controls'

export const metadata = { title: 'Rev share' }

export default async function RevsharePage() {
  const profile = await requireSession()
  const partner = await getActivePartner()

  const [accounts, statements, headline] = await Promise.all([
    listLiveAccounts(),
    listRevshareStatements(),
    revshareHeadline(),
  ])

  const canWrite = can(profile, 'deals.write')
  const canBill = can(profile, 'revshare.write')
  const candidates = canWrite ? await listRevshareCandidates() : []

  const total = accruingTotal(accounts)
  const top = accounts.slice(0, 8)
  const rest = accounts.slice(8)

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Rev share'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Rev share</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
          {partner?.revsharePct ?? 0}% of the monthly base below, billed once a month. The statement
          total is computed from these accounts at the moment it saves — never from what this page
          shows.
        </p>
      </div>

      <div className="relative mb-9 overflow-hidden rounded-[12px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[26px]">
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[4px] bg-volt" />

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-head text-[12px] tracking-[0.15em] text-muted uppercase">
              Accruing monthly base
            </p>
            <p className="num mt-2 font-head text-[48px] leading-none text-volt max-sm:text-[34px]">
              {fmtMoney(total, true)}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              <span className="num">{fmtCount(accounts.length)}</span>{' '}
              {accounts.length === 1 ? 'live account' : 'live accounts'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AddToProgrammeButton candidates={candidates} />
            {canBill ? (
              <RecordRevshareButton
                total={total}
                accounts={accounts.length}
                alreadyRecorded={headline.thisPeriodRecorded !== null}
              />
            ) : null}
          </div>
        </div>

        {top.length > 0 ? (
          <ul className="mt-6 grid gap-1.5">
            {top.map((a) => (
              <AccountRow key={a.dealId} account={a} canWrite={canWrite} />
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[13.5px] text-muted">Nothing in the programme yet.</p>
        )}

        {rest.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] text-muted hover:text-paper">
              +{rest.length} more — view everyone
            </summary>
            <ul className="mt-3 grid gap-1.5">
              {rest.map((a) => (
                <AccountRow key={a.dealId} account={a} canWrite={canWrite} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <SectionHeading>Every statement</SectionHeading>
            <p className="mt-1 text-[12.5px] text-muted">
              <span className="num">{fmtMoney(headline.lifetimeTotal, true)}</span> billed across{' '}
              <span className="num">{fmtCount(headline.statementsRecorded)}</span> statements
            </p>
          </div>
        </div>

        {statements.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">
              No statements recorded yet. The first one shows up here once you record it above.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {statements.map((s) => (
              <Card key={s.id} className={s.voidedAt ? 'opacity-60' : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="num font-head text-[20px] text-paper">
                        {fmtMoney(s.total, true)}
                      </span>
                      <span className="text-[12.5px] text-muted">{s.pct}% of {fmtMoney(s.base, true)}</span>
                      {s.voidedAt ? <Pill tone="lost">Voided</Pill> : null}
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {s.period} · ref {s.reference}
                    </p>
                    {s.voidedAt ? (
                      <p className="mt-1 text-[12.5px] text-danger">Voided — {s.voidReason}</p>
                    ) : null}
                  </div>

                  {canBill && !s.voidedAt ? (
                    <VoidRevshareButton statementId={s.id} reference={s.reference} total={s.total} />
                  ) : null}
                </div>

                {s.lines.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12.5px] text-muted hover:text-paper">
                      {s.lines.length} {s.lines.length === 1 ? 'client' : 'clients'} on this statement
                    </summary>
                    <ul className="mt-2.5 grid gap-1">
                      {s.lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-center gap-3 border-b border-line px-1 py-1.5 text-[13px] last:border-b-0"
                        >
                          <span className="flex-1 truncate text-paper">{line.clientName}</span>
                          <span className="num text-muted">{fmtMoney(line.monthlyValue, true)}/mo</span>
                          <span className="num w-20 text-right text-volt">{fmtMoney(line.share, true)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function AccountRow({ account: a, canWrite }: { account: LiveAccount; canWrite: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]">
      <span className="flex-1 truncate text-paper">{a.clientName}</span>
      <span className="text-[12px] text-muted">
        {a.personName}
        {a.teamName ? ` · ${a.teamName}` : ''}
      </span>
      {a.live === null ? <Pill tone="neutral">Pending</Pill> : null}
      <span className="num w-24 text-right text-paper">{fmtMoney(a.monthlyValue, true)}/mo</span>
      {canWrite ? (
        <span className="flex gap-1.5">
          {a.live === null ? <MarkLiveButton dealId={a.dealId} /> : null}
          <MarkChurnedButton dealId={a.dealId} clientName={a.clientName} />
        </span>
      ) : null}
    </li>
  )
}
