import { FilterBarSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function RosterLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <FilterBarSkeleton />
      <TableSkeleton rows={10} />
    </>
  )
}
