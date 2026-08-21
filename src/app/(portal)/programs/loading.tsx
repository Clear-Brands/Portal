import { CardListSkeleton, PageHeaderSkeleton } from '@/components/skeletons'

export default function ProgramsLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <CardListSkeleton count={4} />
    </>
  )
}
