import { Card, Skeleton } from '@/components/ui'
import { CardListSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function RevshareLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      <Card className="relative mb-9 overflow-hidden p-[26px]">
        <Skeleton className="mb-2.5 h-3 w-32" />
        <Skeleton className="h-9 w-48" />
      </Card>

      <CardListSkeleton count={6} />
    </>
  )
}
