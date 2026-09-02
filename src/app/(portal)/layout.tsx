import Link from 'next/link'

import { signOut } from '@/app/login/actions'
import { can, isInternalAdmin, type Capability } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, listSwitchablePartners } from '@/lib/partner-context'
import { PartnerSwitcher } from '@/components/partner-switcher'
import { NavLinks } from './nav-links'

/**
 * The portal shell.
 *
 * Navigation is real routing, not CSS visibility. The original rendered every
 * screen for every role into a single string on each interaction and toggled
 * which one was displayed — which is why typing in a search box rebuilt about a
 * thousand lines of markup per keystroke.
 */

type NavItem = {
  href: string
  label: string
  capability?: Capability
}

const NAV: Record<string, NavItem[]> = {
  internal: [
    { href: '/', label: 'Dashboard' },
    { href: '/deals', label: 'Deals', capability: 'deals.write' },
    { href: '/payouts', label: 'Payouts', capability: 'payouts.view' },
    { href: '/revshare', label: 'Rev share', capability: 'revshare.view' },
    { href: '/programs', label: 'Programs', capability: 'competitions.view' },
    { href: '/roster', label: 'Team', capability: 'people.write' },
    { href: '/partners', label: 'Partners', capability: 'partners.write' },
    { href: '/activity', label: 'Activity', capability: 'activity.view' },
  ],
  partner_admin: [
    { href: '/', label: 'Dashboard' },
    { href: '/deals', label: 'Deals' },
    { href: '/payouts', label: 'Payouts', capability: 'payouts.view' },
    { href: '/revshare', label: 'Rev share', capability: 'revshare.view' },
    { href: '/programs', label: 'Programs', capability: 'competitions.view' },
    { href: '/roster', label: 'Your team' },
    { href: '/assets', label: 'Assets', capability: 'assets.view' },
  ],
  member: [
    { href: '/', label: 'Dashboard' },
    { href: '/my-deals', label: 'My deals' },
    { href: '/programs', label: 'Competitions', capability: 'competitions.view' },
    { href: '/assets', label: 'Assets', capability: 'assets.view' },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  internal: 'Clear Brands',
  partner_admin: 'Partner admin',
  member: 'Member',
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSession()

  // Fetched for every role, not just internal (previously only internal
  // needed it, for the partner switcher) — the feature-toggle gate right
  // below needs to know the current partner's flags no matter who's looking.
  const [switchablePartners, activePartner] = await Promise.all([
    profile.role === 'internal' ? listSwitchablePartners() : Promise.resolve([]),
    getActivePartner(),
  ])

  // A partner's own Feature toggles (Partners page → "Deals" / "Rev share" /
  // "Competitions & sprints" / "Closers Club") used to only ever get saved —
  // nothing downstream read them back, so turning a feature off never
  // actually hid it from anyone (Charles, Sept 2: "this settings don't seem
  // to be working"). This is the read side, applied to everyone — Clear
  // Brands staff included — while /partners/[id] itself (where the toggles
  // live) stays reachable regardless, since that's how a feature gets turned
  // back on. Programs covers two toggles at once (competitions/sprints and
  // Closers Club both live on that one page), so it only disappears once
  // both are off; which section(s) render is handled on the page itself.
  const featureGate: Record<string, boolean> = {
    '/deals': activePartner?.dealsEnabled ?? true,
    '/my-deals': activePartner?.dealsEnabled ?? true,
    '/revshare': activePartner?.revshareEnabled ?? true,
    '/programs': (activePartner?.competitionsEnabled ?? true) || (activePartner?.annualEnabled ?? true),
  }

  const items = (NAV[profile.role] ?? [])
    .filter((i) => !i.capability || can(profile, i.capability))
    .filter((i) => featureGate[i.href] ?? true)

  // Admin-only and gated on access level rather than a capability, so it can't
  // just live in NAV's static, capability-filtered table above — same "who
  // decides who holds what" reasoning as the page itself (see
  // /clear-brands-team). Previously reachable only via a link buried under
  // Partners; Cristian's ask was to surface it in the main nav instead.
  if (isInternalAdmin(profile)) {
    const partnersIdx = items.findIndex((i) => i.href === '/partners')
    const teamItem = { href: '/clear-brands-team', label: 'Clear Brands team' }
    items.splice(partnersIdx >= 0 ? partnersIdx + 1 : items.length, 0, teamItem)
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-[10px]">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-7 py-3.5 max-sm:px-4">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny local asset; the Netlify image loader adds nothing here. */}
            <img src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
            <span className="font-head text-[15px] tracking-[0.02em] text-paper">Clear Brands</span>
          </Link>
          <span className="font-head text-[11px] tracking-[0.25em] text-muted uppercase max-sm:hidden">
            Partner Portal
          </span>

          <div className="ml-auto flex items-center gap-3">
            {profile.role === 'internal' ? (
              <PartnerSwitcher partners={switchablePartners} activePartnerId={activePartner?.id ?? null} />
            ) : null}
            <span className="text-[12.5px] text-muted max-sm:hidden">
              {profile.name} · {ROLE_LABEL[profile.role]}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-[7px] border border-line px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-white/5 hover:text-paper"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-7 pt-8 pb-24 max-sm:px-4 lg:grid lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-x-11">
        <nav
          aria-label="Sections"
          className="mb-7 lg:sticky lg:top-[86px] lg:mb-0 lg:self-start"
        >
          <NavLinks items={items} />
        </nav>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
