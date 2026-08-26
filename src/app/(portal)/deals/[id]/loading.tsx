import { FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function DealDetailLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={0} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormSkeleton fields={7} />
        <FormSkeleton fields={5} />
      </div>
    </>
  )
}
