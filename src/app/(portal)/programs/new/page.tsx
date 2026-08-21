import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listTeamOptions } from '@/lib/data/deals'
import { Card, Eyebrow } from '@/components/ui'
import { ProgramForm } from './program-form'

export const metadata = { title: 'New program' }

export default async function NewProgramPage() {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) redirect('/programs')

  const partner = await getActivePartner()
  const teams = await listTeamOptions()

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Programs'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">New program</h1>
        <p className="mt-1.5 max-w-[60ch] text-[13.5px] text-muted">
          Standings are computed in the database from the moment this saves — there is nothing to
          recalculate later.
        </p>
      </div>

      <Card className="max-w-[720px]">
        <ProgramForm teams={teams} />
      </Card>
    </>
  )
}
