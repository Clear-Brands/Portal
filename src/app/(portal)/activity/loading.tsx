import { FilterBarSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function ActivityLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={10} />
    </>
  )
}
