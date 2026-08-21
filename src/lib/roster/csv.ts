/**
 * The roster CSV importer, as a pure module — no database, no React, so it can
 * be exercised directly. It is the server's job, not the browser's: the
 * preview and commit actions both call `parseRosterCsv` fresh rather than
 * trusting anything the client resolved, so a stale team list or a tampered
 * preview can never smuggle a bad row into the roster.
 *
 * Header auto-detection: the first row is treated as a header if it names both
 * a "name" and an "email" column (matched against a short list of aliases,
 * case-insensitive). Otherwise every row is read positionally — name, email,
 * pod, kind, in that order — which is the shape a plain export from a
 * spreadsheet with no header row takes.
 *
 * Duplicate handling: an email repeated later in the same file is skipped as
 * a file duplicate; an email already on the roster is skipped as an existing
 * duplicate. Neither is an error — re-running the same file twice is safe.
 */

export type ImportRowStatus = 'ok' | 'duplicate' | 'invalid'

export interface ImportRow {
  rowNumber: number
  name: string
  email: string
  podName: string
  teamId: string | null
  kind: 'rep' | 'manager'
  status: ImportRowStatus
  reason?: string
}

export interface ParseResult {
  rows: ImportRow[]
  truncated: boolean
  usedHeaders: boolean
}

export interface TeamLookup {
  id: string
  name: string
}

const MAX_ROWS = 2000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const HEADER_ALIASES: Record<'name' | 'email' | 'pod' | 'kind', string[]> = {
  name: ['name', 'full name', 'rep', 'rep name', 'person'],
  email: ['email', 'email address', 'e-mail'],
  pod: ['pod', 'team', 'pod name', 'team name'],
  kind: ['kind', 'role', 'type'],
}

/** A small RFC4180-ish parser: quoted fields, escaped quotes as "", CRLF or LF. */
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\r') {
      // swallowed; \n (or end of input) closes the row
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ''))
}

function detectHeader(firstRow: string[]): Partial<Record<'name' | 'email' | 'pod' | 'kind', number>> | null {
  const lower = firstRow.map((c) => c.trim().toLowerCase())
  const map: Partial<Record<'name' | 'email' | 'pod' | 'kind', number>> = {}

  for (const key of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
    const idx = lower.findIndex((c) => HEADER_ALIASES[key].includes(c))
    if (idx !== -1) map[key] = idx
  }

  return map.name !== undefined && map.email !== undefined ? map : null
}

/**
 * A capability the parser itself doesn't know about: only Clear Brands staff
 * may add a pod manager (`people_write_partner_admin` in 0008_rls.sql requires
 * kind = 'rep'). Applying this after parsing, rather than baking a role
 * argument into the parser, keeps CSV mechanics and permission rules separate
 * — and keeps a batch insert from failing atomically on one disallowed row,
 * since anything still 'ok' after this pass is guaranteed to pass RLS.
 */
export function restrictManagersToInternal(rows: ImportRow[], isInternal: boolean): ImportRow[] {
  if (isInternal) return rows
  return rows.map((r) =>
    r.status === 'ok' && r.kind === 'manager'
      ? { ...r, status: 'invalid' as const, reason: 'Only Clear Brands staff can add pod managers' }
      : r,
  )
}

export function parseRosterCsv(text: string, teams: TeamLookup[], existingEmails: Set<string>): ParseResult {
  const allRows = splitCsvRows(text.trim())
  if (allRows.length === 0) return { rows: [], truncated: false, usedHeaders: false }

  const headerMap = detectHeader(allRows[0]!)
  const dataRows = headerMap ? allRows.slice(1) : allRows
  const truncated = dataRows.length > MAX_ROWS
  const capped = dataRows.slice(0, MAX_ROWS)

  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]))
  const seenInFile = new Set<string>()
  const rows: ImportRow[] = []

  capped.forEach((cols, i) => {
    const cell = (key: 'name' | 'email' | 'pod' | 'kind', positionalIndex: number) => {
      const idx = headerMap ? headerMap[key] : positionalIndex
      return idx === undefined ? '' : (cols[idx] ?? '').trim()
    }

    const name = cell('name', 0)
    const email = cell('email', 1).toLowerCase()
    const podRaw = cell('pod', 2)
    const kindRaw = cell('kind', 3).toLowerCase()

    let status: ImportRowStatus = 'ok'
    let reason: string | undefined
    let teamId: string | null = null
    let kind: 'rep' | 'manager' = 'rep'

    if (!name) {
      status = 'invalid'
      reason = 'Missing a name'
    } else if (!email || !EMAIL_RE.test(email)) {
      status = 'invalid'
      reason = 'Missing or invalid email'
    }

    if (status === 'ok' && podRaw) {
      const found = teamByName.get(podRaw.toLowerCase())
      if (!found) {
        status = 'invalid'
        reason = `Unknown pod "${podRaw}" — check spelling or leave it blank`
      } else {
        teamId = found
      }
    }

    if (status === 'ok' && kindRaw) {
      if (kindRaw === 'rep' || kindRaw === 'manager') {
        kind = kindRaw
      } else {
        status = 'invalid'
        reason = `Unknown kind "${kindRaw}" — use "rep" or "manager"`
      }
    }

    if (status === 'ok') {
      if (seenInFile.has(email)) {
        status = 'duplicate'
        reason = 'Repeated in this file'
      } else if (existingEmails.has(email)) {
        status = 'duplicate'
        reason = 'Already on the roster'
      }
    }

    if (email && EMAIL_RE.test(email)) seenInFile.add(email)

    rows.push({
      rowNumber: i + 1 + (headerMap ? 1 : 0),
      name: name || '(blank)',
      email,
      podName: podRaw,
      teamId,
      kind,
      status,
      reason,
    })
  })

  return { rows, truncated, usedHeaders: headerMap !== null }
}
