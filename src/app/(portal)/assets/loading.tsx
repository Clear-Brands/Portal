import { CardListSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function AssetsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardListSkeleton count={5} />
    </>
  )
}
