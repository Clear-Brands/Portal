import Link from 'next/link'
import { notFound } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { getDeal } from '@/lib/data/deals'
import { Card, Eyebrow, SectionHeading, fmtMoney, fmtDate } from '@/components/ui'
import { DealActions, DealStatusCell } from '../deal-actions'

export const metadata = { title: 'Deal' }

/**
 * One deal, on its own page.
 *
 * Added so a deal name anywhere in the app — the payouts drilldown above all —
 * can be a real link instead of just a label. Cristian's ask on the Loom
 * walkthrough (Aug 2026): "if we click this, it goes directly to that deal."
 * Every field and action here already existed on the /deals list row; this
 * just gives one deal a URL of its own so you can land on it directly rather
 * than re-filtering the list to find it again.
 */
export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const { id } = await params

  const deal = await getDeal(id)
  if (!deal) notFound()

  const canWrite = can(profile, 'deals.write')
  const showMoney = can(profile, 'spiffs.view') && (partner?.spiffsEnabled ?? true)

  return (
    <>
      <div className="mb-6">
        <Eyebrow>
          <Link href="/deals" className="hover:text-paper">
            Deals
          </Link>
        </Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-head text-[26px] leading-tight text-paper">{deal.clientName}</h1>
          <DealStatusCell deal={deal} />
        </div>
        {deal.promoNote ? (
          <p className="mt-1.5 text-[13.5px] text-muted italic">{deal.promoNote}</p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading className="mb-3">Details</SectionHeading>
          <Card>
            <dl className="grid gap-2.5 text-[14px]">
              <Row label="Service" value={deal.service || '—'} />
              <Row label="Contact" value={deal.contact || '—'} />
              <Row label="Phone" value={deal.phone || '—'} />
              <Row label="Email" value={deal.email || '—'} />
              <Row
                label="Location"
                value={[deal.city, deal.state].filter(Boolean).join(', ') || '—'}
              />
              <Row
                label="Rep"
                value={
                  <>
                    {deal.personName}
                    {deal.teamName ? <span className="text-muted"> · {deal.teamName}</span> : null}
                  </>
                }
              />
              <Row label="Submitted" value={fmtDate(deal.createdAt)} />
              {deal.closedAt ? <Row label="Marked payable" value={fmtDate(deal.closedAt)} /> : null}
              {deal.lostAt ? <Row label="Marked lost" value={fmtDate(deal.lostAt)} /> : null}
              {deal.status === 'lost' && deal.lostReason ? (
                <Row label="Why" value={deal.lostReason} />
              ) : null}
            </dl>
          </Card>
        </section>

        <section>
          <SectionHeading className="mb-3">Money</SectionHeading>
          <Card>
            {showMoney ? (
              <dl className="grid gap-2.5 text-[14px]">
                <Row
                  label="Rep spiff"
                  value={<span className="num text-volt">{fmtMoney(deal.spiffAmount, true)}</span>}
                />
                {deal.partnerComp > 0 ? (
                  <Row
                    label="Partner cut"
                    value={<span className="num">{fmtMoney(deal.partnerComp, true)}</span>}
                  />
                ) : null}
                {deal.dealValue > 0 ? (
                  <Row label="Deal value" value={<span className="num">{fmtMoney(deal.dealValue, true)}</span>} />
                ) : null}
                {deal.monthlyValue > 0 ? (
                  <Row
                    label="Monthly value"
                    value={<span className="num">{fmtMoney(deal.monthlyValue, true)}/mo</span>}
                  />
                ) : null}
                {deal.live !== null ? (
                  <Row label="Rev share account" value={deal.live ? 'Live' : 'Pending'} />
                ) : null}
                {deal.payoutId ? (
                  <Row
                    label="Payout"
                    value={
                      <Link href="/payouts" className="text-volt underline underline-offset-4">
                        View transfer history
                      </Link>
                    }
                  />
                ) : null}
              </dl>
            ) : (
              <p className="text-[13.5px] text-muted">You cannot see money on this deal.</p>
            )}
          </Card>
        </section>
      </div>

      {canWrite ? (
        <section className="mt-6">
          <SectionHeading className="mb-3">Actions</SectionHeading>
          <Card>
            <div className="flex justify-end">
              <DealActions deal={deal} canWrite={canWrite} />
            </div>
          </Card>
        </section>
      ) : null}
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="text-right text-paper">{value}</dd>
    </div>
  )
}
