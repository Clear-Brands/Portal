import { signOut } from '@/app/login/actions'
import { Button } from '@/components/ui'

export const metadata = { title: 'Almost there' }

/**
 * The login worked but no profile exists for it. An honest screen rather than
 * an empty dashboard or a generic error.
 */
export default function NotOnRosterPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[440px] rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[34px] text-center">
        <p className="font-head text-[11px] tracking-[0.25em] text-muted uppercase">Almost there</p>
        <h1 className="mt-3 font-head text-[24px] leading-tight text-paper">
          Your login works, but you&rsquo;re not on the portal yet
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          Ask Clear Brands to add your email to the roster. Once they do, sign in again and
          everything will be here.
        </p>
        <form action={signOut} className="mt-6">
          <Button variant="ghost" type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  )
}
