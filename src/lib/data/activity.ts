import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'
import type { Page } from '@/lib/types'
import type { ActivityFilters } from '@/lib/activity/filters'

/**
 * The activity read.
 *
 * `activity` is append-only (0006_activity_events.sql) and written entirely by
 * AFTER triggers, so every row here is something that actually happened — no
 * "attempted" or "failed" entries ever land in it. This module only reads and
 * pages what is already there.
 */

export type ActivityKind = 'deal' | 'money' | 'team' | 'program' | 'access'

export interface ActivityRow {
  id: string
  kind: ActivityKind
  text: string
  actorName: string
  createdAt: string
}

type Row = Record<string, unknown>

function toActivityRow(row: Row): ActivityRow {
  return {
    id: row.id as string,
    kind: row.kind as ActivityKind,
    text: row.text as string,
    actorName: (row.actor_name as string) || 'System',
    createdAt: row.created_at as string,
  }
}

export async function listActivity(filters: ActivityFilters): Promise<Page<ActivityRow>> {
  const partner = await getActivePartner()
  if (!partner) {
    return { rows: [], total: 0, page: filters.page, perPage: filters.perPage, pageCount: 1 }
  }

  const supabase = await createClient()

  let query = supabase
    .from('activity')
    .select('id, kind, text, actor_name, created_at', { count: 'exact' })
    .eq('partner_id', partner.id)

  if (filters.kind !== 'all') query = query.eq('kind', filters.kind)

  const clean = filters.q.replace(/[,()"\\%]/g, ' ').trim()
  if (clean) query = query.ilike('text', `%${clean}%`)

  query = query.order('created_at', { ascending: false })

  const from = (filters.page - 1) * filters.perPage
  const { data, count, error } = await query.range(from, from + filters.perPage - 1)

  if (error) throw new Error(`Could not load the activity log: ${error.message}`)

  const total = count ?? 0

  return {
    rows: (data ?? []).map(toActivityRow),
    total,
    page: filters.page,
    perPage: filters.perPage,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  }
}
