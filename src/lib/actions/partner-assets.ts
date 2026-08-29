'use server'

import { randomUUID } from 'crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Upload and remove PDFs on a partner's "Partner assets" card.
 *
 * Both actions use the session-scoped client, never the admin one — the same
 * rule src/lib/supabase/admin.ts states for everything else in this app.
 * That means the storage.objects RLS policies in 0025_partner_assets.sql are
 * load-bearing here: has_cap('assets.write') has to hold for the upload/
 * remove to succeed at all, not just for the metadata row.
 */

const MAX_BYTES = 25 * 1024 * 1024

const UploadMeta = z.object({
  partnerId: z.guid(),
  title: z.string().trim().min(1, 'Give it a name').max(160),
})

export async function uploadPartnerAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'assets.write')) {
    return { error: 'Uploading a partner asset needs asset permissions.' }
  }

  const parsed = UploadMeta.safeParse({
    partnerId: formData.get('partnerId'),
    title: formData.get('title'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a PDF to upload.' }
  }
  if (file.type !== 'application/pdf') {
    return { error: 'Only PDF files can be uploaded here.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'That file is larger than the 25MB limit.' }
  }

  const { partnerId, title } = parsed.data
  // A random id, never the uploaded filename — see the storage_path comment
  // in 0025_partner_assets.sql for why.
  const assetId = randomUUID()
  const storagePath = `${partnerId}/${assetId}.pdf`

  const supabase = await createClient()

  const { error: uploadError } = await supabase.storage
    .from('partner-assets')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return { error: friendly(uploadError.message) }

  const { error: insertError } = await supabase.from('partner_assets').insert({
    id: assetId,
    partner_id: partnerId,
    title,
    storage_path: storagePath,
    file_size: file.size,
    uploaded_by: profile.id,
  })

  if (insertError) {
    // The row is what makes the file findable at all — an upload with no
    // matching row is worse than no upload, so undo it rather than leave an
    // orphaned object in the bucket.
    await supabase.storage.from('partner-assets').remove([storagePath])
    return { error: friendly(insertError.message) }
  }

  revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/assets')
  return { ok: `${title} uploaded.` }
}

const DeleteAsset = z.object({
  assetId: z.guid(),
  partnerId: z.guid(),
})

export async function deletePartnerAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'assets.write')) {
    return { error: 'Removing a partner asset needs asset permissions.' }
  }

  const parsed = DeleteAsset.safeParse({
    assetId: formData.get('assetId'),
    partnerId: formData.get('partnerId'),
  })
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const supabase = await createClient()

  const { data: asset } = await supabase
    .from('partner_assets')
    .select('storage_path')
    .eq('id', parsed.data.assetId)
    .maybeSingle()

  if (!asset) return { error: 'That file could not be found.' }

  // Storage first, row second: if the object delete fails, the row and file
  // stay together and the error surfaces here rather than leaving a row that
  // points at nothing.
  const { error: removeError } = await supabase.storage.from('partner-assets').remove([asset.storage_path])
  if (removeError) return { error: friendly(removeError.message) }

  const { error: deleteError } = await supabase.from('partner_assets').delete().eq('id', parsed.data.assetId)
  if (deleteError) return { error: friendly(deleteError.message) }

  revalidatePath(`/partners/${parsed.data.partnerId}`)
  revalidatePath('/assets')
  return { ok: 'Removed.' }
}

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong. Try again, and tell Charles if it keeps happening.'
}
