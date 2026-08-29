'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button, Field, Notice, fmtBytes, fmtDate, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { uploadPartnerAsset, deletePartnerAsset } from '@/lib/actions/partner-assets'
import type { ActionState } from '@/lib/actions/deals'
import type { PartnerAsset } from '@/lib/types'

const initial: ActionState = {}

/**
 * The PDFs Clear Brands has put in front of one partner's own sales team and
 * account managers — rate sheets, program flyers, training material. Upload
 * and remove live here, on the partner's own admin page, the same place
 * their rates and features already do; the read-only mirror of this list is
 * /assets, for partner_admin/member logins to find on their own.
 */
export function PartnerAssets({
  partnerId,
  assets,
  canManage,
}: {
  partnerId: string
  assets: PartnerAsset[]
  canManage: boolean
}) {
  return (
    <div className="grid gap-3">
      {assets.length === 0 ? (
        <p className="text-[13.5px] text-muted">No assets uploaded yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]"
            >
              <span className="flex-1 truncate text-paper">{asset.title}</span>
              <span className="text-[12px] text-muted">{fmtBytes(asset.fileSize)}</span>
              <span className="text-[12px] text-muted">{fmtDate(asset.createdAt)}</span>
              <a
                href={`/api/assets/${asset.id}`}
                className="rounded-[7px] border border-line px-2.5 py-1.5 text-[12.5px] text-paper hover:bg-white/5"
              >
                Download
              </a>
              {canManage ? <DeleteAssetButton partnerId={partnerId} assetId={asset.id} title={asset.title} /> : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <UploadAssetButton partnerId={partnerId} />
      ) : (
        <p className="text-[12.5px] text-muted">You cannot upload or remove this partner&rsquo;s assets.</p>
      )}
    </div>
  )
}

function UploadAssetButton({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(uploadPartnerAsset, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <div>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
          Upload a PDF
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a partner asset"
        description="PDFs only, up to 25MB. Visible to this partner's own logins right away."
        confirmLabel="Upload"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ partnerId }}
      >
        <div className="grid gap-3.5">
          <Field label="Name" hint="What shows in the list — e.g. &ldquo;2026 rate sheet&rdquo;">
            <input name="title" required maxLength={160} className={inputClass} />
          </Field>
          <Field label="File">
            <input name="file" type="file" accept="application/pdf" required className={inputClass} />
          </Field>
        </div>
      </ConfirmDialog>

      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
    </>
  )
}

function DeleteAssetButton({
  partnerId,
  assetId,
  title,
}: {
  partnerId: string
  assetId: string
  title: string
}) {
  const [state, action, pending] = useActionState(deletePartnerAsset, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
        Remove
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${title}?`}
        description="It disappears from this partner's Assets page immediately. This can't be undone — you'd need to upload it again."
        confirmLabel="Remove"
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ assetId, partnerId }}
      />
    </>
  )
}

