import { notFound, redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getPartnerById, listPartnerLogins } from '@/lib/data/partners'
import { listPartnerAssets } from '@/lib/data/partner-assets'
import { switchActivePartner } from '@/lib/actions/partners'
import { Card, Eyebrow, Button, Pill, SectionHeading } from '@/components/ui'
import { ArchivePartnerButton, RestorePartnerButton } from '../partner-controls'
import { PartnerSettingsForm } from './partner-settings-form'
import { PartnerRatesForm } from './partner-rates-form'
import { AdminLogins } from './admin-logins'
import { PartnerAssets } from './partner-assets'

export const metadata = { title: 'Partner' }

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) redirect('/')

  const { id } = await params
  const partner = await getPartnerById(id)
  if (!partner) notFound()

  const canEditProfile = can(profile, 'partners.write')
  const canEditRates = can(profile, 'rates.write')
  const canManageAssets = can(profile, 'assets.write')
  const canManagePerms = profile.role === 'internal' && profile.access === 'admin'

  const [logins, assets] = await Promise.all([
    listPartnerLogins(partner.id),
    listPartnerAssets(partner.id),
  ])

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Partners</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">{partner.name}</h1>
          {partner.archivedAt ? (
            <div className="mt-2">
              <Pill tone="lost">Archived</Pill>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={switchActivePartner}>
            <input type="hidden" name="partnerId" value={partner.id} />
            <Button size="sm" variant="ghost" type="submit">
              View their roster
            </Button>
          </form>
          {partner.archivedAt ? (
            <RestorePartnerButton partnerId={partner.id} />
          ) : (
            <ArchivePartnerButton partnerId={partner.id} name={partner.name} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading className="mb-3">Profile & features</SectionHeading>
          <Card>
            {canEditProfile ? (
              <PartnerSettingsForm partner={partner} />
            ) : (
              <p className="text-[13.5px] text-muted">You cannot edit this partner&rsquo;s settings.</p>
            )}
          </Card>
        </section>

        <section>
          <SectionHeading className="mb-3">Rates & compensation</SectionHeading>
          <Card>
            {canEditRates ? (
              <PartnerRatesForm partner={partner} />
            ) : (
              <p className="text-[13.5px] text-muted">You cannot edit this partner&rsquo;s rates.</p>
            )}
          </Card>
        </section>
      </div>

      <section className="mt-6">
        <SectionHeading className="mb-3">Partner assets</SectionHeading>
        <Card>
          <PartnerAssets partnerId={partner.id} assets={assets} canManage={canManageAssets} />
        </Card>
        <p className="mt-2 text-[12.5px] text-muted">
          PDFs only. Visible to this partner&rsquo;s own logins on their Assets page as soon as they&rsquo;re
          uploaded.
        </p>
      </section>

      <section className="mt-6">
        <SectionHeading className="mb-3">Admin logins</SectionHeading>
        <Card>
          <AdminLogins partnerId={partner.id} logins={logins} canManagePerms={canManagePerms} />
        </Card>
        <p className="mt-2 text-[12.5px] text-muted">
          Member logins and their permissions are managed from the roster — use &ldquo;View their
          roster&rdquo; above.
        </p>
      </section>
    </>
  )
}
