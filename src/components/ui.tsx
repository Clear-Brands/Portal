import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* -------------------------------------------------------------------------- */
/* Skeletons — see src/components/skeletons.tsx for the per-page compositions  */
/* -------------------------------------------------------------------------- */

/** One pulsing bar. Every loading.tsx in the app is built from this. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[6px] bg-white/[0.06]', className)} />
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[12px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[22px]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-head text-[11px] tracking-[0.25em] text-muted uppercase">
      {children}
    </p>
  )
}

export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'font-head text-[15px] tracking-[0.04em] text-paper uppercase',
        className,
      )}
    >
      {children}
    </h2>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat card — the "Owed right now" pattern                                    */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: string
  note?: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card>
      <p className="font-head text-[12px] tracking-[0.15em] text-muted uppercase">{label}</p>
      <p
        className={cn(
          'num mt-2 font-head text-[32px] leading-none',
          accent ? 'text-volt' : 'text-paper',
        )}
      >
        {value}
      </p>
      {note ? <div className="mt-2 text-[12.5px] text-muted">{note}</div> : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Pills                                                                       */
/* -------------------------------------------------------------------------- */

const PILL_STYLES: Record<string, string> = {
  submitted: 'border-line bg-surface-2 text-muted',
  in_talks: 'border-line-strong bg-transparent text-paper',
  closed: 'border-volt/40 bg-volt-dim text-volt',
  paid: 'border-volt bg-volt text-ink',
  lost: 'border-danger/35 bg-danger/10 text-danger',
  neutral: 'border-line bg-surface-2 text-muted',
}

const PILL_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  in_talks: 'In talks',
  closed: 'Payable',
  paid: 'Paid',
  lost: 'Lost',
}

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof PILL_STYLES | string
  children?: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-[99px] border px-2 py-[3px] font-head text-[11px] tracking-[0.08em] uppercase',
        PILL_STYLES[tone] ?? PILL_STYLES.neutral,
      )}
    >
      {children ?? PILL_LABELS[tone] ?? tone}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-[8px] font-head font-bold tracking-[0.01em]',
        'transition-[filter,background-color] hover:brightness-110 active:brightness-95',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100',
        size === 'sm' ? 'px-3 py-1.5 text-[12.5px]' : 'px-4 py-2.5 text-[14px]',
        variant === 'primary' && 'bg-volt text-ink',
        variant === 'ghost' && 'border border-line bg-transparent text-paper hover:bg-white/5',
        variant === 'danger' && 'border border-danger/35 bg-transparent text-danger hover:bg-danger/10',
        className,
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Form field                                                                  */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span> : null}
    </label>
  )
}

export const inputClass = cn(
  'w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper',
  'placeholder:text-muted/60 focus:border-volt/50',
)

/* -------------------------------------------------------------------------- */
/* Messages — an error says what went wrong and how to fix it                  */
/* -------------------------------------------------------------------------- */

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success'
  children: React.ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[8px] border px-3.5 py-3 text-[13.5px]',
        tone === 'error' && 'border-danger/35 bg-danger/10 text-danger',
        tone === 'success' && 'border-volt/40 bg-volt-dim text-volt',
        tone === 'info' && 'border-line bg-surface-2 text-muted',
      )}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const moneyExact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

/** One money format across the whole application. */
export function fmtMoney(value: number | string | null | undefined, exact = false) {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return exact ? '$0.00' : '$0'
  return exact ? moneyExact.format(n) : money.format(n)
}

export function fmtCount(value: number | string | null | undefined) {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return new Intl.NumberFormat('en-US').format(Number.isFinite(n) ? n : 0)
}

/** A file size — "340 KB", "2.4 MB" — for the partner assets list. */
export function fmtBytes(value: number | string | null | undefined) {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * One short-date format across the app: "Jan 5".
 *
 * A plain `date` column (paid_date, a deal's created-at date, a competition's
 * start/end) comes back as "YYYY-MM-DD" with no time component. `new
 * Date("2026-01-05")` parses that as UTC midnight, so formatting it in a
 * timezone west of UTC prints the day before — the exact class of bug ground
 * rule 6 exists to prevent. Appending a local midnight time avoids it. A full
 * timestamp (already has a time component) passes through unchanged.
 */
export function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const iso = value.length === 10 ? `${value}T00:00:00` : value
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

/** Same as fmtDate, plus the time — for timestamps where the time matters. */
export function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}
