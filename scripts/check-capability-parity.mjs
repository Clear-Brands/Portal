#!/usr/bin/env node
/**
 * Asserts that the two halves of the permission model agree.
 *
 * ROLE_DEFAULTS in src/lib/auth/capabilities.ts decides what the interface
 * renders. capability_default() in supabase/migrations/0007_access.sql decides
 * what the database allows. If they drift, the portal offers someone a button
 * the database will refuse — or quietly hides one it would have permitted, which
 * is how the original ended up with permission checkboxes that changed nothing.
 *
 * Run by `npm test` and by CI.
 */

import { readFileSync, readdirSync } from 'node:fs'

const ts = readFileSync('src/lib/auth/capabilities.ts', 'utf8')

// The defaults live in 0007; the policies that consume each capability live in
// 0008. Both matter, so read every migration.
const sql = readFileSync('supabase/migrations/0007_access.sql', 'utf8')
const allSql = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
  .join('\n')

let failures = 0

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    console.error(`  FAIL  ${label}`)
    failures += 1
  }
}

/** Pull the capability list out of the TypeScript CAPABILITIES object. */
function tsCapabilities() {
  const block = ts.match(/export const CAPABILITIES = \{([\s\S]*?)\n\} as const/)?.[1] ?? ''
  return [...block.matchAll(/'([a-z.]+)':/g)].map((m) => m[1])
}

/** Pull one role's default list out of the TypeScript ROLE_DEFAULTS object. */
function tsDefaults(roleKey) {
  const block = ts.match(/export const ROLE_DEFAULTS[\s\S]*?\n\} as const/)?.[0] ?? ''
  const entry = block.match(
    new RegExp(`'?${roleKey.replace('.', '\\.')}'?:\\s*\\[([\\s\\S]*?)\\]`),
  )?.[1]
  if (!entry) return null
  return [...entry.matchAll(/'([a-z.]+)'/g)].map((m) => m[1])
}

/**
 * Pull one role's default list out of the SQL capability_default() body — the
 * LAST such definition across every migration, not the first.
 *
 * capability_default() started in 0007, but a later migration can redefine it
 * wholesale with `create or replace function` to add a case branch — the
 * same thing 0018_ongoing_revshare_comp.sql already does for
 * compute_partner_comp(), and what 0025_partner_assets.sql does here to add
 * assets.view. Matching only the first occurrence in `allSql` would keep
 * comparing the TypeScript side against 0007's superseded body forever, so
 * this searches every migration and takes the most recent match.
 */
function sqlDefaults(match) {
  const re = new RegExp(`${match}[\\s\\S]*?p_key in \\(([\\s\\S]*?)\\)`, 'g')
  const clause = [...allSql.matchAll(re)].at(-1)?.[1]
  if (!clause) return null
  return [...clause.matchAll(/'([a-z.]+)'/g)].map((m) => m[1])
}

const same = (a, b) =>
  a && b && a.length === b.length && [...a].sort().join() === [...b].sort().join()

console.log('\nCAPABILITY PARITY — TypeScript vs SQL\n')

const caps = tsCapabilities()
check(`the vocabulary has ${caps.length} capabilities`, caps.length > 0)

// Every capability the interface can render must be referenced somewhere in the
// schema — either in the defaults or in a policy that gates on it. A capability
// that appears in neither is a button with nothing behind it, which is exactly
// what the original had roughly eighteen of.
for (const cap of caps) {
  check(`the schema enforces "${cap}"`, allSql.includes(`'${cap}'`))
}

const pairs = [
  ['internal:manager', "p_role = 'internal' and p_access = 'manager'", 'Clear Brands manager'],
  ['partner_admin', "p_role = 'partner_admin'", 'partner admin'],
  ['member', "p_role = 'member'", 'member'],
]

for (const [tsKey, sqlMatch, label] of pairs) {
  const a = tsDefaults(tsKey)
  const b = sqlDefaults(sqlMatch)
  check(
    `${label} defaults match  (ts: ${a?.length ?? '?'}, sql: ${b?.length ?? '?'})`,
    same(a, b),
  )
  if (!same(a, b)) {
    console.error(`        TypeScript: ${a?.sort().join(', ') ?? 'not found'}`)
    console.error(`        SQL:        ${b?.sort().join(', ') ?? 'not found'}`)
  }
}

// The admin case is special: it holds everything, expressed as `then true`.
check(
  'Clear Brands admin holds every capability in SQL',
  /p_role = 'internal' and p_access = 'admin' then true/.test(sql),
)
check(
  'Clear Brands admin holds every capability in TypeScript',
  /'internal:admin':\s*Object\.keys\(CAPABILITIES\)/.test(ts),
)

console.log('')
if (failures > 0) {
  console.error(`${failures} parity check(s) failed.\n`)
  process.exit(1)
}
console.log('The interface and the database agree.\n')
