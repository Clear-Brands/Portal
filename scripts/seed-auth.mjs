#!/usr/bin/env node
/**
 * Creates the demo sign-ins on a local Supabase stack and links them to the
 * profiles the seed already inserted.
 *
 * seed.sql cannot do this on its own: on a real Supabase, auth.users has columns
 * the SQL seed has no business writing, and a password has to be hashed by the
 * auth server rather than by hand. So the SQL seeds the org and the money, and
 * this seeds the logins.
 *
 * Local only. It refuses to run against anything that is not localhost.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvFile('NEXT_PUBLIC_SUPABASE_URL')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvFile('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !key) {
  fail(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.example to .env.local and paste the values `supabase start` printed.',
  )
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  fail(
    `Refusing to run against ${url}.\n` +
      'This script creates accounts with known passwords and is for local development only.\n' +
      'Real logins are created by invitation from inside the portal.',
  )
}

const PASSWORD = 'clearbrands-dev'

/** Matches the profiles seeded by supabase/seed.sql. */
const ACCOUNTS = [
  { email: 'cristian@clearbrands.io', name: 'Cristian Droescher', hint: 'Clear Brands · admin' },
  { email: 'team@clearbrands.io', name: 'Clear Brands Team', hint: 'Clear Brands · admin' },
  { email: 'jordan@clearbrands.io', name: 'Jordan Wells', hint: 'Clear Brands · manager' },
  { email: 'partners@fieldpulse.com', name: 'FieldPulse Admin', hint: 'Partner admin' },
  { email: 'marcus@fieldpulse.com', name: 'Marcus Hale', hint: 'Pod manager · Sales' },
  { email: 'priya@fieldpulse.com', name: 'Priya Nair', hint: 'Pod manager · CS' },
  { email: 'jake@fieldpulse.com', name: 'Jake Miller', hint: 'Member · Sales' },
]

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('\nCreating demo sign-ins…\n')

for (const account of ACCOUNTS) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: account.name },
  })

  let userId = created?.user?.id

  if (error) {
    // Already there from a previous run — find it and reset the password so the
    // documented one always works.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existing = list?.users.find((u) => u.email === account.email)
    if (!existing) {
      console.error(`  ✗ ${account.email} — ${error.message}`)
      continue
    }
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD })
  }

  // Point the seeded profile at this account.
  const { error: linkError } = await admin
    .from('profiles')
    .update({ user_id: userId })
    .eq('email', account.email)

  if (linkError) {
    console.error(`  ✗ ${account.email} — could not link profile: ${linkError.message}`)
    continue
  }

  console.log(`  ✓ ${account.email.padEnd(26)} ${account.hint}`)
}

console.log(`\n  Password for all of them: ${PASSWORD}`)
console.log('\n  Sign-in emails are caught locally at http://127.0.0.1:54324\n')

function readEnvFile(name) {
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim()
  } catch {
    return undefined
  }
}

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}
