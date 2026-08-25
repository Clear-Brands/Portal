import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { searchPeople } from '@/lib/data/deals'
import { Card, Eyebrow } from '@/components/ui'
import { DealForm } from './deal-form'

export const metadata = { title: 'Add a deal' }

export default async function NewDealPage() {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) redirect('/deals')

  const partner = await getActivePartner()
  const people = await searchPeople('', 25)

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Deals'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Add a deal</h1>
        <p className="mt-1.5 max-w-[60ch] text-[13.5px] text-muted">
          It lands as Submitted. Move it to In talks once you&rsquo;re engaged, then to Payable when
          the client&rsquo;s first invoice is paid.
        </p>
      </div>

      <Card className="max-w-[720px]">
        <DealForm
          people={people}
          defaultSpiff={partner?.defaultSpiff ?? 250}
          canPrice={can(profile, 'rates.write')}
          showDealValue={partner?.compMode === 'pct'}
          showMonthlyValue={partner?.compMode === 'ongoing_pct'}
        />
      </Card>
    </>
  )
}
