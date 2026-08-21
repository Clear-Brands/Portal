import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function TeamLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </>
  )
}
