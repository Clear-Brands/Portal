'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Notice, Pill, cn, fmtCount } from '@/components/ui'
import {
  commitRosterImport,
  previewRosterImport,
  sendRosterInviteBatch,
  type ImportPreviewState,
  type RosterCommitState,
} from '@/lib/actions/roster'

const previewInitial: ImportPreviewState = {}
const commitInitial: RosterCommitState = {}

/** How many invites one request sends, and how long to pause between
 * requests — see sendRosterInviteBatch's doc comment for why this is
 * batched client-side instead of one big server-side loop. */
const INVITE_BATCH_SIZE = 20
const INVITE_BATCH_PAUSE_MS = 500

type InviteProgress = {
  total: number
  done: number
  failed: { name: string; email: string }[]
}

const STATUS_TONE: Record<'ok' | 'duplicate' | 'invalid', string> = {
  ok: 'neutral',
  duplicate: 'submitted',
  invalid: 'lost',
}

const STATUS_LABEL: Record<'ok' | 'duplicate' | 'invalid', string> = {
  ok: 'Ready',
  duplicate: 'Skipped — duplicate',
  invalid: 'Skipped — invalid',
}

/**
 * The two-step CSV import: preview, then commit.
 *
 * `previewRosterImport` and `commitRosterImport` both re-parse and re-validate
 * the raw text server-side — this component never sends anything the server
 * hasn't already checked. The browser's only job is holding the file's text
 * and which rows the person left checked.
 *
 * Wrapped so a successful commit can offer "import another file" by remounting
 * the inner component — that resets both action states and local selection
 * without a full page reload.
 */
export function ImportWizard() {
  const [resetToken, setResetToken] = useState(0)
  return <Wizard key={resetToken} onDone={() => setResetToken((n) => n + 1)} />
}

function Wizard({ onDone }: { onDone: () => void }) {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [previewState, previewAction, previewPending] = useActionState(
    previewRosterImport,
    previewInitial,
  )
  const [commitState, commitAction, commitPending] = useActionState(commitRosterImport, commitInitial)
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [createLogins, setCreateLogins] = useState(false)
  const [inviteProgress, setInviteProgress] = useState<InviteProgress | null>(null)

  const preview = previewState.preview
  const pendingInvites = commitState.pendingInvites

  // Drive the invite send in small, paced batches once a commit hands back
  // newly-created people still waiting on one — see sendRosterInviteBatch.
  // Runs once per distinct pendingInvites array (a fresh commit always
  // produces a new array reference; re-renders from state updates below
  // reuse the same one, so this doesn't restart mid-send).
  useEffect(() => {
    if (!pendingInvites || pendingInvites.length === 0) return
    let cancelled = false

    async function run() {
      const people = pendingInvites!
      const byId = new Map(people.map((p) => [p.id, p]))
      const failed: { name: string; email: string }[] = []
      let done = 0
      setInviteProgress({ total: people.length, done: 0, failed: [] })

      for (let i = 0; i < people.length; i += INVITE_BATCH_SIZE) {
        if (cancelled) return
        const batchIds = people.slice(i, i + INVITE_BATCH_SIZE).map((p) => p.id)
        const result = await sendRosterInviteBatch(batchIds)

        if ('results' in result) {
          for (const r of result.results) {
            done++
            if (!r.ok) failed.push({ name: byId.get(r.personId)?.name ?? r.email, email: r.email })
          }
        } else {
          // The whole batch call failed (e.g. a session hiccup) — count
          // every id in it as failed rather than losing track of them.
          for (const id of batchIds) {
            done++
            const person = byId.get(id)
            failed.push({ name: person?.name ?? '', email: person?.email ?? '' })
          }
        }

        if (!cancelled) setInviteProgress({ total: people.length, done, failed: [...failed] })
        if (!cancelled && i + INVITE_BATCH_SIZE < people.length) {
          await new Promise((resolve) => setTimeout(resolve, INVITE_BATCH_PAUSE_MS))
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [pendingInvites])

  // A fresh preview defaults to every ready row selected. Adjusted during
  // render rather than in a useEffect — see use-close-on-success.ts for why.
  const [seenPreview, setSeenPreview] = useState(preview)
  if (preview !== seenPreview) {
    setSeenPreview(preview)
    if (preview) {
      setIncluded(new Set(preview.rows.filter((r) => r.status === 'ok').map((r) => r.rowNumber)))
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setCsvText(await file.text())
  }

  function toggleRow(rowNumber: number) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  if (commitState.ok) {
    const sending = inviteProgress && inviteProgress.done < inviteProgress.total
    return (
      <div className="grid gap-4">
        <Notice tone="success">{commitState.ok}</Notice>
        {inviteProgress ? (
          <Notice tone={sending ? 'info' : inviteProgress.failed.length > 0 ? 'error' : 'success'}>
            {sending
              ? `Sending portal invites… ${inviteProgress.done} of ${inviteProgress.total}`
              : inviteProgress.failed.length === 0
                ? `All ${inviteProgress.total} portal invite${inviteProgress.total === 1 ? '' : 's'} sent.`
                : `Sent ${inviteProgress.total - inviteProgress.failed.length} of ${inviteProgress.total} portal invites. ${inviteProgress.failed.length} didn't go through — use "Send login invite" from their row on the roster to retry: ${inviteProgress.failed.map((f) => f.name || f.email).join(', ')}`}
          </Notice>
        ) : null}
        <div>
          <Button variant="ghost" onClick={onDone} disabled={Boolean(sending)}>
            Import another file
          </Button>
        </div>
      </div>
    )
  }

  const readyRows = preview?.rows.filter((r) => r.status === 'ok') ?? []
  const otherRows = preview?.rows.filter((r) => r.status !== 'ok') ?? []

  return (
    <div className="grid gap-5">
      <form action={previewAction} className="grid gap-3.5">
        <input type="hidden" name="csvText" value={csvText} />

        <label className="block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            CSV file
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-paper file:mr-3 file:rounded-[6px] file:border-0 file:bg-volt file:px-3 file:py-1.5 file:font-head file:text-[12.5px] file:text-ink"
          />
          {fileName ? <span className="mt-1.5 block text-[12.5px] text-muted">{fileName}</span> : null}
        </label>

        <details>
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-paper">
            Paste CSV text instead
          </summary>
          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value)
              setFileName('')
            }}
            rows={6}
            placeholder="name,email,pod,kind"
            className="mt-2 w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] text-paper placeholder:text-muted/60"
          />
        </details>

        {previewState.error ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {previewState.error}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={!csvText || previewPending}>
            {previewPending ? 'Reading…' : 'Preview import'}
          </Button>
        </div>
      </form>

      {preview ? (
        <div className="grid gap-3.5 border-t border-line pt-5">
          {preview.truncated ? (
            <Notice tone="info">
              This file has more than 2,000 rows — only the first 2,000 were read.
            </Notice>
          ) : null}

          <p className="text-[13px] text-muted">
            <span className="num text-paper">{fmtCount(readyRows.length)}</span> ready,{' '}
            <span className="num">{fmtCount(otherRows.length)}</span> skipped
            {!preview.usedHeaders ? ' — no header row detected, read as name, email, pod, kind' : ''}
          </p>

          <div className="max-h-[420px] overflow-y-auto rounded-[8px] border border-line">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <Th />
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Pod</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {[...readyRows, ...otherRows].map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={cn('align-top', row.status !== 'ok' && 'opacity-55')}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        disabled={row.status !== 'ok'}
                        checked={included.has(row.rowNumber)}
                        onChange={() => toggleRow(row.rowNumber)}
                        aria-label={`Include ${row.name}`}
                      />
                    </Td>
                    <Td>{row.name}</Td>
                    <Td>{row.email}</Td>
                    <Td>{row.podName || '—'}</Td>
                    <Td>
                      <Pill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Pill>
                      {row.reason ? (
                        <div className="mt-1 text-[11.5px] text-muted">{row.reason}</div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={commitAction} className="grid gap-3">
            <input type="hidden" name="csvText" value={preview.csvText} />
            <input type="hidden" name="includeRows" value={Array.from(included).join(',')} />

            <label className="flex items-center gap-2 text-[13.5px] text-paper">
              <input
                type="checkbox"
                name="createLogins"
                checked={createLogins}
                onChange={(e) => setCreateLogins(e.target.checked)}
              />
              Also send each of them a portal login invite
            </label>

            {commitState.error ? (
              <p role="alert" className="text-[12.5px] text-danger">
                {commitState.error}
              </p>
            ) : null}

            <div>
              <Button type="submit" disabled={included.size === 0 || commitPending}>
                {commitPending
                  ? 'Importing…'
                  : `Import ${included.size} ${included.size === 1 ? 'person' : 'people'}`}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="border-b border-line-strong px-3 py-2.5 text-left font-head text-[10.5px] tracking-[0.12em] text-muted uppercase">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-line px-3 py-2.5 text-[13px]">{children}</td>
}
