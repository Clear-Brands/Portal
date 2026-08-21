import { FilterBarSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function DealsLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={2} />
      <FilterBarSkeleton />
      <TableSkeleton rows={10} />
    </>
  )
}
