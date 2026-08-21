import Link from 'next/link'

import { cn, fmtCount } from '@/components/ui'
import { PER_PAGE_OPTIONS } from '@/lib/deals/filters'

/**
 * Server-rendered pagination.
 *
 * The counts are real, because the query that produced this page also returned
 * the unpaged total from SQL. The original paged in the browser over whatever
 * subset had been downloaded, which silently became a lie past 1,000 rows.
 */
export function Pagination({
  page,
  perPage,
  total,
  pageCount,
  buildHref,
}: {
  page: number
  perPage: number
  total: number
  pageCount: number
  buildHref: (patch: { page?: number; perPage?: number }) => string
}) {
  if (total === 0) return null

  const first = (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12.5px] text-muted">
        Showing <span className="num">{fmtCount(first)}</span>–
        <span className="num">{fmtCount(last)}</span> of{' '}
        <span className="num">{fmtCount(total)}</span>
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] text-muted">Per page</span>
          {PER_PAGE_OPTIONS.map((n) => (
            <Link
              key={n}
              href={buildHref({ perPage: n, page: 1 })}
              className={cn(
                'num rounded-[7px] px-2 py-1 text-[12.5px]',
                n === perPage ? 'bg-volt text-ink' : 'text-muted hover:bg-white/5 hover:text-paper',
              )}
            >
              {n}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <PagerLink href={buildHref({ page: page - 1 })} disabled={page <= 1}>
            Previous
          </PagerLink>
          <span className="num text-[12.5px] text-muted">
            {page} / {pageCount}
          </span>
          <PagerLink href={buildHref({ page: page + 1 })} disabled={page >= pageCount}>
            Next
          </PagerLink>
        </div>
      </div>
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="rounded-[7px] border border-line px-2.5 py-1 text-[12.5px] text-muted/40">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-[7px] border border-line px-2.5 py-1 text-[12.5px] text-muted hover:bg-white/5 hover:text-paper"
    >
      {children}
    </Link>
  )
}
