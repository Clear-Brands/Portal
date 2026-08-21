import Link from 'next/link'
import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { listPartnerRollups } from '@/lib/data/partners'
import { Card, Eyebrow, Button, Pill, fmtCount, fmtMoney } from '@/components/ui'
import { ArchivePartnerButton, RestorePartnerButton } from './partner-controls'

export const metadata = { title: 'Partners' }

export default async function PartnersPage() {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) redirect('/')

  const rollups = await listPartnerRollups()
  const active = rollups.filter((r) => !r.archivedAt)
  const archived = rollups.filter((r) => r.archivedAt)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Clear Brands</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Partners</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
            The whole book. Payable and lifetime-paid come straight from{' '}
            <span className="text-paper">v_partner_rollup</span> — nothing here is summed in the
            browser.
          </p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="ghost">
            <Link href="/partners/team">Clear Brands team</Link>
          </Button>
          <Button size="sm">
            <Link href="/partners/new">Onboard a partner</Link>
          </Button>
        </div>
      </div>

      <Section title="Active" rows={active} showRestore={false} />

      {archived.length > 0 ? (
        <div className="mt-9">
          <Section title="Archived" rows={archived} showRestore />
        </div>
      ) : null}
    </>
  )
}

function Section({
  title,
  rows,
  showRestore,
}: {
  title: string
  rows: Awaited<ReturnType<typeof listPartnerRollups>>
  showRestore: boolean
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-[14px] text-muted">Nothing here yet.</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr>
            <Th>{title}</Th>
            <Th align="right">Pods</Th>
            <Th align="right">Active people</Th>
            <Th align="right">Open deals</Th>
            <Th align="right">Payable now</Th>
            <Th align="right">Lifetime paid</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.partnerId} className="align-top hover:bg-white/[0.025]">
              <Td>
                <Link href={`/partners/${r.partnerId}`} className="text-paper hover:text-volt">
                  {r.name}
                </Link>
                {r.archivedAt ? (
                  <div className="mt-1">
                    <Pill tone="lost">Archived</Pill>
                  </div>
                ) : null}
              </Td>
              <Td align="right">
                <span className="num text-muted">{fmtCount(r.teamCount)}</span>
              </Td>
              <Td align="right">
                <span className="num text-paper">{fmtCount(r.activePeople)}</span>
                <span className="num text-[12px] text-muted"> / {fmtCount(r.totalPeople)}</span>
              </Td>
              <Td align="right">
                <span className="num text-paper">{fmtCount(r.openDeals)}</span>
              </Td>
              <Td align="right">
                <span className="num text-volt">{fmtMoney(r.payableNow, true)}</span>
              </Td>
              <Td align="right">
                <span className="num text-muted">{fmtMoney(r.lifetimePaid, true)}</span>
              </Td>
              <Td align="right">
                {showRestore ? (
                  <RestorePartnerButton partnerId={r.partnerId} />
                ) : (
                  <ArchivePartnerButton partnerId={r.partnerId} name={r.name} />
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`border-b border-line-strong px-[22px] py-3 font-head text-[11px] tracking-[0.15em] text-muted uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td
      className={`border-b border-line px-[22px] py-3.5 text-[14px] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </td>
  )
}
