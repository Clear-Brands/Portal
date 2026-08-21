import { FormSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function NewProgramLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <FormSkeleton fields={5} />
    </>
  )
}
