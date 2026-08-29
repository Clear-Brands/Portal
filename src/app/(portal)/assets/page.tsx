import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listPartnerAssets } from '@/lib/data/partner-assets'
import { Card, Eyebrow, SectionHeading, fmtBytes, fmtDate } from '@/components/ui'

export const metadata = { title: 'Assets' }

/**
 * What Clear Brands has put here for this partner's own team to find — read
 * and download only. Uploading and removing happen on the partner's admin
 * page (/partners/[id]); this is the mirror partner_admin and member logins
 * reach on their own nav, scoped to their own partner by getActivePartner()
 * and, underneath that, by row-level security regardless of what this page
 * asks for.
 */
export default async function AssetsPage() {
  const profile = await requireSession()
  if (!can(profile, 'assets.view')) redirect('/')

  const partner = await getActivePartner()
  const assets = partner ? await listPartnerAssets(partner.id) : []

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Assets'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Assets</h1>
      </div>

      <section>
        <SectionHeading className="mb-3">Documents</SectionHeading>

        {assets.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">Nothing has been uploaded here yet.</p>
          </Card>
        ) : (
          <ul className="grid gap-2.5">
            {assets.map((asset) => (
              <li key={asset.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex-1 truncate text-[14.5px] text-paper">{asset.title}</span>
                  <span className="text-[12.5px] text-muted">{fmtBytes(asset.fileSize)}</span>
                  <span className="text-[12.5px] text-muted">{fmtDate(asset.createdAt)}</span>
                  <a
                    href={`/api/assets/${asset.id}`}
                    className="rounded-[8px] bg-volt px-3 py-1.5 font-head text-[12.5px] font-bold tracking-[0.01em] text-ink transition-[filter] hover:brightness-110 active:brightness-95"
                  >
                    Download
                  </a>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
