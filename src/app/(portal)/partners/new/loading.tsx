import { FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function NewPartnerLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <FormSkeleton fields={4} />
    </>
  )
}
