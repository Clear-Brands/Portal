import { redirect } from 'next/navigation'

import { requireSession } from '@/lib/session'
import { listInternalLogins } from '@/lib/data/partners'
import { Card, Eyebrow, Pill } from '@/components/ui'
import { PermissionGridButton } from '@/components/permission-grid'
import { AddMemberButton } from './add-member-button'

export const metadata = { title: 'Clear Brands team' }

const ACCESS_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  none: 'None',
}

export default async function ClearBrandsTeamPage() {
  const profile = await requireSession()
  // Admin-only, not merely partners.write: this is the screen that decides who
  // else holds partners.write (and everything else), so only someone who
  // already holds every capability by construction may reach it.
  if (!(profile.role === 'internal' && profile.access === 'admin')) redirect('/partners')

  const logins = await listInternalLogins()

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Clear Brands</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Team & permissions</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
            Admins hold every capability by construction and are not editable here. A manager&rsquo;s
            checked boxes are what they hold beyond the defaults for &ldquo;manager&rdquo; — day-to-day work,
            no money writes.
          </p>
        </div>
        <AddMemberButton />
      </div>

      <div className="grid gap-2.5 sm:hidden">
        {logins.map((login) => (
          <Card key={login.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-paper">{login.name}</div>
                <div className="truncate text-[12px] text-muted">
                  {login.title ? `${login.title} · ` : ''}
                  {login.email}
                </div>
              </div>
              <Pill tone={login.access === 'admin' ? 'closed' : 'neutral'}>
                {ACCESS_LABEL[login.access]}
              </Pill>
            </div>
            <div className="mt-3 flex justify-end border-t border-line pt-3">
              {login.access === 'admin' ? (
                <span className="text-[12.5px] text-muted">Holds everything</span>
              ) : login.userId === profile.userId ? (
                <span className="text-[12.5px] text-muted">This is you</span>
              ) : (
                <PermissionGridButton
                  login={{
                    profileId: login.id,
                    name: login.name,
                    role: login.role,
                    access: login.access,
                    perms: login.perms,
                  }}
                />
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-x-auto p-0 sm:block">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Access</Th>
              <Th align="right">Permissions</Th>
            </tr>
          </thead>
          <tbody>
            {logins.map((login) => (
              <tr key={login.id} className="align-top hover:bg-white/[0.025]">
                <Td>
                  <div className="text-paper">{login.name}</div>
                  <div className="text-[12px] text-muted">
                    {login.title ? `${login.title} · ` : ''}
                    {login.email}
                  </div>
                </Td>
                <Td>
                  <Pill tone={login.access === 'admin' ? 'closed' : 'neutral'}>
                    {ACCESS_LABEL[login.access]}
                  </Pill>
                </Td>
                <Td align="right">
                  {login.access === 'admin' ? (
                    <span className="text-[12.5px] text-muted">Holds everything</span>
                  ) : login.userId === profile.userId ? (
                    <span className="text-[12.5px] text-muted">This is you</span>
                  ) : (
                    <PermissionGridButton
                      login={{
                        profileId: login.id,
                        name: login.name,
                        role: login.role,
                        access: login.access,
                        perms: login.perms,
                      }}
                    />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`border-b border-line-strong px-[22px] py-3 font-head text-[11px] tracking-[0.15em] text-muted uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td
      className={`border-b border-line px-[22px] py-3.5 text-[14px] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </td>
  )
}
