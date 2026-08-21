import { FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function NewDealLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <FormSkeleton fields={5} />
    </>
  )
}
