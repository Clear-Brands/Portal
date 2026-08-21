import { CardListSkeleton, FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function PartnerDetailLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={2} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormSkeleton fields={4} />
        <FormSkeleton fields={3} />
      </div>
      <div className="mt-9">
        <CardListSkeleton count={3} />
      </div>
    </>
  )
}
