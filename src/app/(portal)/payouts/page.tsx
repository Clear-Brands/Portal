import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { batchTotals, groupBatchByPerson, listCompAwaitingApproval, listPayableBatch } from '@/lib/data/deals'
import { listPayoutsWithLines, payoutHeadline } from '@/lib/data/payouts'
import { Card, Eyebrow, Pill, SectionHeading, Button, fmtCount, fmtDate, fmtMoney } from '@/components/ui'
import { ApproveCompButton, RecordPayoutButton, VoidPayoutButton } from './payout-controls'

export const metadata = { title: 'Payouts' }

/** Cycled through the split bar, matching the original's palette. */
const SPLIT_COLORS = ['#C8F52F', '#7FB818', '#E6FF7A', '#5E8A0F', '#A7D62B', '#3F5C0A']

export default async function PayoutsPage() {
  const profile = await requireSession()
  const partner = await getActivePartner()

  const [lines, awaitingApproval, payouts, headline] = await Promise.all([
    listPayableBatch(),
    listCompAwaitingApproval(),
    listPayoutsWithLines(),
    payoutHeadline(),
  ])

  const totals = batchTotals(lines)
  const perPerson = groupBatchByPerson(lines)
  const canPay = can(profile, 'payouts.write')
  const canExport = can(profile, 'exports.run')

  const top = perPerson.slice(0, 6)
  const rest = perPerson.slice(6)
  const restTotal = rest.reduce((n, r) => n + r.amount, 0)

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Payouts'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Payouts</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
          Money never moves through this portal. Send one ACH from your bank for the total below,
          then record it here so every rep&rsquo;s numbers update.
        </p>
      </div>

      {/* The batch card — the signature surface of the original, kept. */}
      <div className="relative mb-9 overflow-hidden rounded-[12px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[26px]">
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[4px] bg-volt"
        />

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-head text-[12px] tracking-[0.15em] text-muted uppercase">
              Payable right now
            </p>
            <p className="num mt-2 font-head text-[48px] leading-none text-volt max-sm:text-[34px]">
              {fmtMoney(totals.total, true)}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              <span className="num">{fmtCount(totals.deals)}</span>{' '}
              {totals.deals === 1 ? 'deal' : 'deals'} ·{' '}
              <span className="num">{fmtCount(perPerson.length)}</span>{' '}
              {perPerson.length === 1 ? 'person' : 'people'}
              {totals.comp > 0 ? (
                <>
                  {' '}
                  · <span className="num">{fmtMoney(totals.spiff, true)}</span> to reps,{' '}
                  <span className="num">{fmtMoney(totals.comp, true)}</span> to {partner?.name}
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canExport && totals.deals > 0 ? (
              <Button variant="ghost" size="sm">
                <a href="/api/export/payable">Export batch for Excel</a>
              </Button>
            ) : null}
            {canPay ? (
              <RecordPayoutButton
                total={totals.total}
                people={perPerson.length}
                deals={totals.deals}
                alreadyRecorded={headline.thisPeriodRecorded !== null}
              />
            ) : null}
          </div>
        </div>

        {perPerson.length > 0 ? (
          <>
            <div className="mt-6 flex h-[10px] overflow-hidden rounded-[5px]">
              {top.map((p, i) => (
                <span
                  key={p.personId}
                  style={{
                    flex: p.amount,
                    background: SPLIT_COLORS[i % SPLIT_COLORS.length],
                  }}
                  title={`${p.personName} — ${fmtMoney(p.amount, true)}`}
                />
              ))}
              {restTotal > 0 ? (
                <span style={{ flex: restTotal, background: '#3A3A40' }} title="Everyone else" />
              ) : null}
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {top.map((p, i) => (
                <li key={p.personId} className="text-[13px]">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 text-paper marker:content-none [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden
                        className="h-2 w-2 flex-none rounded-[2px]"
                        style={{ background: SPLIT_COLORS[i % SPLIT_COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{p.personName}</span>
                      <span className="num text-muted">{fmtMoney(p.amount, true)}</span>
                    </summary>
                    <DealDrilldown
                      deals={p.lines.map((l) => ({ key: l.dealId, clientName: l.clientName, amount: l.spiffAmount }))}
                    />
                  </details>
                </li>
              ))}
            </ul>

            {rest.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] text-muted hover:text-paper">
                  +{rest.length} more · {fmtMoney(restTotal, true)} — view everyone
                </summary>
                <ul className="mt-3 max-h-[250px] overflow-y-auto rounded-[8px] border border-line">
                  {rest.map((p) => (
                    <li key={p.personId} className="border-b border-line px-3.5 py-2 text-[13px] last:border-b-0">
                      <details>
                        <summary className="flex cursor-pointer list-none items-center gap-3 text-paper marker:content-none [&::-webkit-details-marker]:hidden">
                          <span className="flex-1 truncate">{p.personName}</span>
                          <span className="text-[12px] text-muted">{p.teamName}</span>
                          <span className="num text-muted">{fmtMoney(p.amount, true)}</span>
                        </summary>
                        <DealDrilldown
                      deals={p.lines.map((l) => ({ key: l.dealId, clientName: l.clientName, amount: l.spiffAmount }))}
                    />
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Awaiting approval — flat-fee deals held out of the batch above until
          someone signs off on them once. Only ever non-empty for a partner
          on flat-fee compensation. */}
      {awaitingApproval.length > 0 ? (
        <section className="mb-9">
          <div className="mb-3">
            <SectionHeading>Awaiting approval</SectionHeading>
            <p className="mt-1 text-[12.5px] text-muted">
              Each needs a one-time approval before it can be paid — or, for ongoing rev share,
              before it starts accruing.
            </p>
          </div>

          <div className="grid gap-2.5">
            {awaitingApproval.map((line) => (
              <Card key={line.dealId} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[14px] text-paper">{line.clientName}</div>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {line.personName}
                    {line.spiffAmount > 0 ? (
                      <>
                        {' '}
                        · <span className="num">{fmtMoney(line.spiffAmount, true)}</span> rep
                      </>
                    ) : null}{' '}
                    ·{' '}
                    {line.ongoingRevshare ? (
                      line.monthlyValue > 0 ? (
                        <>
                          <span className="num">{fmtMoney(line.monthlyValue, true)}</span>/mo ongoing at{' '}
                          <span className="num">{line.revsharePct}%</span>
                        </>
                      ) : (
                        <span className="text-danger">needs a monthly value — see Rev share</span>
                      )
                    ) : (
                      <>
                        <span className="num">{fmtMoney(line.partnerComp, true)}</span> company
                      </>
                    )}
                  </p>
                </div>
                {canPay ? (
                  <ApproveCompButton
                    dealId={line.dealId}
                    clientName={line.clientName}
                    spiffAmount={line.spiffAmount}
                    partnerComp={line.partnerComp}
                    ongoingRevshare={line.ongoingRevshare}
                    monthlyValue={line.monthlyValue}
                    revsharePct={line.revsharePct}
                  />
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* History */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <SectionHeading>Every transfer</SectionHeading>
            <p className="mt-1 text-[12.5px] text-muted">
              <span className="num">{fmtMoney(headline.lifetimePaid, true)}</span> paid across{' '}
              <span className="num">{fmtCount(headline.batchesRecorded)}</span> batches
            </p>
          </div>
          {canExport ? (
            <Button variant="ghost" size="sm">
              <a href="/api/export/payouts">Export full ledger</a>
            </Button>
          ) : null}
        </div>

        {payouts.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">
              No transfers recorded yet. The first one shows up here once you record it above.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {payouts.map((payout) => (
              <Card
                key={payout.id}
                className={payout.voidedAt ? 'opacity-60' : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="num font-head text-[20px] text-paper">
                        {fmtMoney(payout.total, true)}
                      </span>
                      {payout.voidedAt ? <Pill tone="lost">Voided</Pill> : null}
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {fmtDate(payout.paidDate)} · ref {payout.reference}
                      {payout.compTotal > 0 ? (
                        <>
                          {' '}
                          · <span className="num">{fmtMoney(payout.spiffTotal, true)}</span> reps,{' '}
                          <span className="num">{fmtMoney(payout.compTotal, true)}</span> partner
                        </>
                      ) : null}
                    </p>
                    {payout.voidedAt ? (
                      <p className="mt-1 text-[12.5px] text-danger">
                        Voided — {payout.voidReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canExport ? (
                      <Button variant="ghost" size="sm">
                        <a href={`/api/export/payout/${payout.id}`}>Export</a>
                      </Button>
                    ) : null}
                    {canPay && !payout.voidedAt ? (
                      <VoidPayoutButton
                        payoutId={payout.id}
                        reference={payout.reference}
                        total={payout.total}
                      />
                    ) : null}
                  </div>
                </div>

                {payout.perPerson.length > 0 ? (
                  <details className="mt-3 border-t border-line pt-3">
                    <summary className="cursor-pointer text-[12.5px] text-muted hover:text-paper">
                      {payout.perPerson.length} {payout.perPerson.length === 1 ? 'person' : 'people'} — reconcile
                      by deal
                    </summary>
                    <ul className="mt-2.5 grid gap-1.5">
                      {payout.perPerson.map((p) => (
                        <li key={p.personId ?? p.personName} className="text-[13px]">
                          {p.lines.length > 0 ? (
                            <details>
                              <summary className="flex cursor-pointer list-none items-center gap-3 text-paper marker:content-none [&::-webkit-details-marker]:hidden">
                                <span className="flex-1 truncate">{p.personName}</span>
                                <span className="text-[12px] text-muted">{p.teamName}</span>
                                <span className="num text-muted">{fmtMoney(p.amount, true)}</span>
                              </summary>
                              <DealDrilldown
                                deals={p.lines.map((l) => ({
                                  key: l.id,
                                  clientName: l.clientName,
                                  amount: l.amount,
                                }))}
                              />
                            </details>
                          ) : (
                            <div className="flex items-center gap-3 text-paper">
                              <span className="flex-1 truncate">{p.personName}</span>
                              <span className="text-[12px] text-muted">{p.teamName}</span>
                              <span className="num text-muted">{fmtMoney(p.amount, true)}</span>
                            </div>
                          )}
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

/** A rep's (or the company's) rolled-up amount, expanded to the individual
 *  deals it came from — the deal-level reconciliation both the pre-payment
 *  batch and the recorded history need. */
function DealDrilldown({ deals }: { deals: { key: string | null; clientName: string; amount: number }[] }) {
  if (deals.length === 0) return null
  return (
    <ul className="mt-1.5 ml-4 grid gap-1 border-l border-line pl-3">
      {deals.map((d, i) => (
        <li key={d.key ?? i} className="flex items-center gap-2 text-[12px] text-muted">
          <span className="flex-1 truncate">{d.clientName}</span>
          <span className="num text-paper">{fmtMoney(d.amount, true)}</span>
        </li>
      ))}
    </ul>
  )
}
