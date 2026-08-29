import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { toPartnerAsset, type PartnerAsset } from '@/lib/types'

/**
 * Partner asset reads.
 *
 * One function for both surfaces that list these: the admin "Partner assets"
 * card on /partners/[id] and the rep-facing /assets page both call this with
 * whichever partner they mean — row-level security (0025_partner_assets.sql)
 * is what actually keeps a partner_admin/member from seeing another
 * partner's rows, not the caller's choice of id.
 */
export async function listPartnerAssets(partnerId: string): Promise<PartnerAsset[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_assets')
    .select('id, partner_id, title, storage_path, file_size, created_at, uploaded_by_profile:profiles(name)')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not load partner assets: ${error.message}`)

  return (data ?? []).map((row) => {
    const uploader = Array.isArray(row.uploaded_by_profile)
      ? row.uploaded_by_profile[0]
      : row.uploaded_by_profile
    return toPartnerAsset({ ...row, uploaded_by_name: uploader?.name ?? null })
  })
}
