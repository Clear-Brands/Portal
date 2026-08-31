import Link from 'next/link'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { loadPipeline } from '@/lib/data/deals'
import { Button, Card, Eyebrow } from '@/components/ui'
import { PipelineBoard } from './board'

export const metadata = { title: 'Pipeline' }

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const params = await searchParams
  const churnedParam = params.churned
  const churned = (Array.isArray(churnedParam) ? churnedParam[0] : churnedParam) === '1'
  const pipeline = await loadPipeline(churned)

  if (!pipeline) {
    return (
      <Card>
        <p className="text-[14px] text-muted">No partner program is selected.</p>
      </Card>
    )
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{partner?.name ?? 'Deals'}</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Pipeline</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Drag a card, or focus one and press Space then the arrow keys.
            {churned ? ' Showing churned accounts only.' : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={churned ? 'primary' : 'ghost'} size="sm">
            <Link href={churned ? '/deals/pipeline' : '/deals/pipeline?churned=1'}>
              {churned ? 'Churned only ✓' : 'Churned only'}
            </Link>
          </Button>
          <Button variant="ghost" size="sm">
            <Link href={'/deals'}>List view</Link>
          </Button>
        </div>
      </div>

      <PipelineBoard
        columns={pipeline.columns}
        counts={pipeline.counts}
        perColumn={pipeline.perColumn}
        showMoney={can(profile, 'spiffs.view') && (partner?.spiffsEnabled ?? true)}
        canWrite={can(profile, 'deals.write')}
      />
    </>
  )
}
