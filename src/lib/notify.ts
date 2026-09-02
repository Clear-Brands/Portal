import 'server-only'

/**
 * A minimal, direct call to Resend's HTTP API — no SDK, because this is the
 * one place in the app that hand-sends an email. Everything else outbound
 * (invites, password resets, sign-in links, and the self-serve "verify your
 * email" step in src/app/signup/actions.ts) goes through Supabase Auth's own
 * mailer, already wired to the project's custom SMTP. This is only for the
 * one message Supabase has no reason to send on its own: telling Clear
 * Brands a new self-serve account was just created.
 *
 * `RESEND_API_KEY` is provisioned in Netlify but was unused until now.
 * Best-effort by design — if it's missing, or the call fails, this logs and
 * returns rather than throwing. A signup that already succeeded should never
 * fail, or leave an orphaned auth account, because a notification email
 * didn't go out.
 */
export async function notifyClearBrands(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.SIGNUP_NOTIFY_EMAIL || 'charles@digitaldoorknockers.com'

  if (!apiKey) {
    console.error('[notify] RESEND_API_KEY is not set — could not send:', subject)
    return
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Clear Brands Portal <noreply@updates.clearbrandsportal.io>',
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      console.error('[notify] Resend responded', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[notify] failed to send', err)
  }
}
