import { Card, Skeleton } from '@/components/ui'

/**
 * Skeleton compositions, one per shape a page.tsx actually renders.
 *
 * Every route in this app fetches its data inside an async Server Component,
 * so the App Router's automatic behaviour — a sibling loading.tsx wraps
 * page.tsx in a Suspense boundary and shows while that await resolves — is
 * what makes these appear at all. Each loading.tsx composes one or two of
 * these rather than hand-drawing bars, so a shape change here fixes every
 * page that uses it at once.
 */

export function PageHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Skeleton className="mb-2.5 h-3 w-28" />
        <Skeleton className="h-7 w-52" />
      </div>
      {actions > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FilterBarSkeleton() {
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-9 min-w-[220px] flex-1" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
    </Card>
  )
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="mb-2.5 h-3 w-20" />
          <Skeleton className="h-8 w-24" />
        </Card>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-line-strong px-[22px] py-3">
        <Skeleton className="h-3 w-full max-w-[420px]" />
      </div>
      <div className="grid">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line px-[22px] py-3.5 last:border-b-0"
          >
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <Skeleton className="mb-2 h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </Card>
      ))}
    </div>
  )
}

/** The pipeline board is columns of cards, not a table — its own shape. */
export function KanbanSkeleton({ columns = 3, cardsPerColumn = 3 }: { columns?: number; cardsPerColumn?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c}>
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="grid gap-2.5">
            {Array.from({ length: cardsPerColumn }).map((_, i) => (
              <Card key={i} className="p-3.5">
                <Skeleton className="mb-2 h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card className="max-w-[640px]">
      <div className="grid gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-1.5 h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-28" />
      </div>
    </Card>
  )
}
