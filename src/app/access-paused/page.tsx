import { signOut } from '@/app/login/actions'
import { Button } from '@/components/ui'

export const metadata = { title: 'Access paused' }

/**
 * A deactivated member. Note the wording: deactivation is a pause, not a
 * forfeiture — their earned spiffs stay on the books and still pay out.
 */
export default function AccessPausedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[440px] rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[34px] text-center">
        <p className="font-head text-[11px] tracking-[0.25em] text-muted uppercase">Paused</p>
        <h1 className="mt-3 font-head text-[24px] leading-tight text-paper">
          Your portal access is paused
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          Anything you&rsquo;ve already earned stays on the books and still pays out. Speak to your
          admin when you need access switched back on.
        </p>
        <form action={signOut} className="mt-6">
          <Button variant="ghost" type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  )
}
