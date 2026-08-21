import { FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function RosterImportLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <FormSkeleton fields={2} />
    </>
  )
}
