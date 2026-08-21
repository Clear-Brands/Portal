import type { NextRequest } from 'next/server'

import { requireSession } from '@/lib/session'
import { searchPeople } from '@/lib/data/deals'

/**
 * Backs the rep picker.
 *
 * Searched on demand and capped, rather than rendering an <option> for all 500
 * people on every render the way the original did.
 */
export async function GET(request: NextRequest) {
  await requireSession()

  const term = request.nextUrl.searchParams.get('q') ?? ''
  const people = await searchPeople(term, 25)

  return Response.json(people, { headers: { 'Cache-Control': 'no-store' } })
}
