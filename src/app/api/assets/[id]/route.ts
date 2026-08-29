import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/lib/session'

/**
 * Downloads a partner asset by redirecting to a short-lived signed URL.
 *
 * No capability check here beyond requireSession() — there doesn't need to
 * be one. Both the row lookup below and the signed-URL creation itself go
 * through the session-scoped client, so partner_assets_read_* and
 * partner_assets_storage_read (0025_partner_assets.sql) already decide who
 * gets past this: a partner_admin/member without assets.view, or scoped to
 * a different partner, gets no row back and this 404s exactly as if the
 * asset didn't exist — which, from their side, it doesn't.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await params

  const supabase = await createClient()

  const { data: asset } = await supabase
    .from('partner_assets')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!asset) return new Response('Not found', { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from('partner-assets')
    .createSignedUrl(asset.storage_path, 60)

  if (error || !signed) {
    return new Response('Could not prepare that file — try again.', { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
