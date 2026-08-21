import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function PartnersLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={2} />
      <TableSkeleton rows={8} />
    </>
  )
}
