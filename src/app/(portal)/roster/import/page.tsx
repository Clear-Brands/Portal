import { redirect } from 'next/navigation'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { Card, Eyebrow } from '@/components/ui'
import { ImportWizard } from './import-wizard'

export const metadata = { title: 'Import roster' }

export default async function RosterImportPage() {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) redirect('/roster')

  const partner = await getActivePartner()

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Roster'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Import roster</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
          Everyone in this file is added to{' '}
          <span className="text-paper">{partner?.name ?? 'the selected partner'}</span> — switch
          partners with the picker in the header before importing if that&rsquo;s not the one you
          mean. A CSV with name and email columns — pod and kind are optional. Nothing writes to
          the roster until you review the preview below and commit it. Re-uploading the same file
          is safe: anyone already on the roster shows up as a duplicate and is skipped.
        </p>
      </div>

      <Card className="max-w-[900px]">
        <ImportWizard />
      </Card>
    </>
  )
}
