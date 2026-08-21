import { Card, Skeleton } from '@/components/ui'
import { CardListSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function PayoutsLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      {/* The batch card's split bar */}
      <Card className="relative mb-9 overflow-hidden p-[26px]">
        <Skeleton className="mb-2.5 h-3 w-32" />
        <Skeleton className="mb-5 h-9 w-48" />
        <Skeleton className="h-3 w-full rounded-[99px]" />
      </Card>

      <CardListSkeleton count={6} />
    </>
  )
}
