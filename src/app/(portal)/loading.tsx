import { PageHeaderSkeleton, StatRowSkeleton, TableSkeleton } from '@/components/skeletons'

export default function DashboardLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-9">
        <StatRowSkeleton count={4} />
      </div>
      <TableSkeleton rows={6} />
    </>
  )
}
