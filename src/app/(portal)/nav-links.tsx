'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/components/ui'

export interface NavItem {
  href: string
  label: string
}

/**
 * The nav list, split out as a client component for one reason: knowing which
 * link is "current" needs the pathname, and the portal shell around this is a
 * server component with no pathname of its own to read. `aria-current` also
 * needs an exact-vs-prefix distinction — "/roster" is current on
 * "/roster/import" too, but "/" is current on "/" alone, never on every route.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const current =
          item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <li key={item.href} className="flex-none lg:flex-auto">
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'block rounded-[7px] px-3 py-2 text-[13.5px] whitespace-nowrap',
                current
                  ? 'bg-volt-dim font-semibold text-volt'
                  : 'text-muted hover:bg-white/5 hover:text-paper',
              )}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
