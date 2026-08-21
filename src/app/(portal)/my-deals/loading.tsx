import { FormSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

export default function MyDealsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-9">
        <FormSkeleton fields={3} />
      </div>
      <TableSkeleton rows={8} />
    </>
  )
}
