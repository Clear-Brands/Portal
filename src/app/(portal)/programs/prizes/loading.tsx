import { CardListSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function PrizesLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <CardListSkeleton count={6} />
    </>
  )
}
