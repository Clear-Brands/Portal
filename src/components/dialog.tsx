'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { Button, cn } from '@/components/ui'

/**
 * The replacement for `confirm()` and `prompt()`.
 *
 * Every destructive and money action in the original ran through a native
 * browser dialog: a grey box that shows a sentence, cannot show the amount, the
 * reference and the affected reps, and cannot be styled or made accessible.
 * Recording a payout — the single most consequential action in the product —
 * was a `confirm()`.
 *
 * Built on the native <dialog> element, which gives a real focus trap, Escape
 * to close, inert background content and the top layer for free. Everything
 * around it is ours.
 */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Covers Escape, which closes the dialog without going through onClose.
    const handleClose = () => onClose()
    node.addEventListener('close', handleClose)
    return () => node.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // Clicking the backdrop closes; clicking the panel does not.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-[12px] border border-line bg-surface p-0 text-paper',
        'backdrop:bg-black/70 backdrop:backdrop-blur-[2px]',
        width === 'sm' && 'max-w-[420px]',
        width === 'md' && 'max-w-[560px]',
        width === 'lg' && 'max-w-[760px]',
      )}
    >
      <div className="border-b border-line px-6 py-5">
        <h2 id={titleId} className="font-head text-[19px] leading-tight text-paper">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1.5 text-[13.5px] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  )
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2.5">{children}</div>
}

/**
 * A confirmation that makes the caller name what is about to happen.
 *
 * `requireTyped` asks the person to retype a value — the ACH reference, a
 * partner's name — before the confirm button enables. Reserved for actions that
 * move money or cannot be undone; used everywhere it becomes noise people learn
 * to click through.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  destructive = false,
  requireTyped,
  pending = false,
  error,
  children,
  formAction,
  hiddenFields,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  requireTyped?: { label: string; value: string }
  pending?: boolean
  error?: string
  children?: React.ReactNode
  formAction: (formData: FormData) => void
  hiddenFields?: Record<string, string>
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const unlocked = !requireTyped || typed.trim() === requireTyped.value.trim()

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <form action={formAction}>
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        {children}

        {requireTyped ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
              {requireTyped.label}
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper"
            />
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 rounded-[8px] border border-danger/35 bg-danger/10 px-3.5 py-3 text-[13.5px] text-danger">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={destructive ? 'danger' : 'primary'}
            disabled={!unlocked || pending}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
