import { KanbanSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function PipelineLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <KanbanSkeleton columns={3} cardsPerColumn={4} />
    </>
  )
}
