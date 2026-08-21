import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { Card, Eyebrow } from '@/components/ui'
import { OnboardForm } from './onboard-form'

export const metadata = { title: 'Onboard a partner' }

export default async function NewPartnerPage() {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) redirect('/partners')

  return (
    <>
      <div className="mb-6">
        <Eyebrow>Clear Brands</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Onboard a partner</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
          Creates the partner, its first pod, and sends an admin login invite — all three, so a new
          partner never sits half set up. Rates, feature toggles and additional pods can be edited
          from the partner's page afterward.
        </p>
      </div>

      <Card className="max-w-[640px]">
        <OnboardForm />
      </Card>
    </>
  )
}
