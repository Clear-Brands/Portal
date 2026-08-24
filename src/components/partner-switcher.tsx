'use client'

import { usePathname } from 'next/navigation'

import { switchActivePartner } from '@/lib/actions/partners'
import type { Partner } from '@/lib/types'

/**
 * Which partner program Clear Brands staff are looking at right now.
 *
 * Before this, switching partners meant opening Partners, clicking into the
 * one you wanted, and clicking "View their roster" — the only place
 * `switchActivePartner` was ever wired up. Every page that reads
 * `getActivePartner()` (dashboard, roster, deals, programs, CSV import…) was
 * already scoped to whichever partner that picked; there was just no way to
 * change it from anywhere else. This puts the same switch in the header, and
 * resubmits to the page you're already on instead of bouncing you to roster.
 */
export function PartnerSwitcher({
  partners,
  activePartnerId,
}: {
  partners: Partner[]
  activePartnerId: string | null
}) {
  const pathname = usePathname()

  if (partners.length === 0) return null

  return (
    <form action={switchActivePartner}>
      <input type="hidden" name="redirectTo" value={pathname} />
      <select
        name="partnerId"
        defaultValue={activePartnerId ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Viewing partner"
        className="max-w-[160px] rounded-[7px] border border-line bg-transparent px-2.5 py-1.5 text-[12.5px] text-paper hover:bg-white/5 max-sm:hidden"
      >
        {partners.map((p) => (
          <option key={p.id} value={p.id} className="bg-ink text-paper">
            {p.name}
          </option>
        ))}
      </select>
    </form>
  )
}
