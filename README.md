# Clear Brands Partner Portal

A rebuild of the partner referral portal — referrals, spiffs, rev share, competitions
and payouts across multiple partner programs.

Next.js 16 · TypeScript · Supabase Postgres · Netlify

---

## Running it locally

You need [Node 20+](https://nodejs.org), [Docker Desktop](https://docs.docker.com/desktop/)
(running), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # starts Postgres, auth and the local dashboard
cp .env.example .env.local     # then paste in the keys `supabase start` printed
supabase db reset              # applies every migration and loads the demo data
npm run seed:auth              # creates the demo logins
npm run dev
```

Then open <http://localhost:3000>.

### Demo logins

All seven use the password `clearbrands-dev`.

| Email | What they see |
|---|---|
| `cristian@clearbrands.io` | Clear Brands, full admin |
| `team@clearbrands.io` | Clear Brands, full admin |
| `jordan@clearbrands.io` | Clear Brands **manager** — same work, no money writes |
| `partners@fieldpulse.com` | FieldPulse's own admin view |
| `marcus@fieldpulse.com` | Pod manager, Sales |
| `priya@fieldpulse.com` | Pod manager, CS |
| `jake@fieldpulse.com` | An ordinary member |

Sign in as Jordan and then as Cristian to see the permission model actually working —
the manager genuinely cannot record a payout, not merely at the button.

### Useful addresses while developing

| | |
|---|---|
| The portal | <http://localhost:3000> |
| Database dashboard | <http://127.0.0.1:54323> |
| Every outbound email | <http://127.0.0.1:54324> |

Nothing is emailed off the machine in development. Sign-in links land in that inbox.

---

## How it is put together

The single architectural decision, from which most of the rest follows:
**the browser never holds a key that can write to the database.**

```
browser  ──cookie──▶  Next.js server  ──user session──▶  Postgres
                            │                              (RLS applies
                            └── service role ──▶           as that person)
                                (auth admin, webhooks,
                                 outbox worker only)
```

The original ran entirely in the browser and talked to Postgres directly. That is a
normal way to build a prototype, but it left no place to enforce a rule — which is
why a rep could post a referral with any commission amount they chose.

Everything a signed-in person does goes through `@/lib/supabase/server`, which applies
their own permissions. `@/lib/supabase/admin` bypasses all of that and is reserved for
three things: creating auth accounts, delivering queued events, and handling inbound
webhooks. ESLint blocks importing it anywhere else.

### Where things live

```
src/
  app/
    (portal)/          the signed-in application
    login/             password sign-in, magic link for invites and resets
    auth/callback/     where a sign-in link lands
  lib/
    auth/capabilities  the permission vocabulary — mirrored into SQL
    supabase/server    per-request client, RLS applies
    supabase/admin     service role, three legitimate callers
    session            who is signed in, read fresh on every request
  components/ui        cards, pills, buttons, money formatting
  proxy.ts             session refresh + the first auth gate

supabase/
  migrations/          ordered, idempotent, verified against an empty database
  seed.sql             the demo dataset, ported from the original fixtures
  tests/               sanity, row-level security, capability parity

scripts/
  verify-migrations    the whole database suite against a throwaway Postgres
  seed-auth            demo logins (refuses to run against anything but localhost)
  check-capability-parity   asserts the TypeScript and SQL permission models agree
```

### The permission model

One vocabulary, written twice on purpose and kept in step by a test:

- `src/lib/auth/capabilities.ts` — decides what the interface renders
- `capability_default()` in `0007_access.sql` — decides what the database allows

`scripts/check-capability-parity.mjs` fails the build if they drift. The original had
four overlapping permission systems and enforced two keys out of roughly twenty;
unchecking a box hid a button and changed nothing underneath.

### Money

Every amount is `numeric(12,2)` and every sum happens in SQL. No total is ever computed
in JavaScript. The original calculated a payout total twice — once in the browser for
the confirmation dialog and the notification email, once in SQL for the actual record —
and the two could disagree about the same batch.

The ledger is append-only by privilege, not by convention: no session role holds
`DELETE` on `deals`, `payouts`, `payout_lines`, `revshare_*` or `activity`. Voiding a
payout writes a void entry and returns the deals to payable; the line items stay
forever, so a voided batch can still tell you what was in it.

---

## Checks

```bash
npm run typecheck     # TypeScript
npm test              # capability parity between the app and the schema
npm run db:verify     # migrations on an empty database + RLS assertions
npm run build         # production build
npm run verify        # all of the above
```

`npm run db:verify` needs a local `psql` and permission to create a database. It drops
and recreates a throwaway one, applies every migration in order to it, loads the seed,
and then asserts row-level security by impersonating each seeded login.

That last part is the one worth watching. It proves, among other things, that a rep
cannot set their own commission, that a rep's leaderboard shows their whole pod while
their deal list shows only their own rows, that a Clear Brands manager cannot record a
payout through any route, and that partner companies cannot see each other.

CI runs the same suite on every push, including a fresh-install check against an empty
Postgres — the check the original schema could never have passed, since it modified
tables before creating them.

---

## Deploying

Not yet — the app is built locally first and reviewed before anything is hosted.
When it is time:

1. Create two Supabase projects, `clearbrands-staging` and `clearbrands-production`
   (two is the free-plan limit, which is exactly enough).
2. `supabase link` then `supabase db push` against each.
3. Connect this repository in Netlify. Build command `npm run build`, publish `.next`.
   The Next.js plugin in `netlify.toml` handles the rest.
4. Set the environment variables listed at the top of `netlify.toml` in the Netlify UI.
   `SUPABASE_SERVICE_ROLE_KEY` is a server secret and must never be given a
   `NEXT_PUBLIC_` prefix.
5. In Supabase: Authentication → URL Configuration → set the site URL and add
   `https://<your-domain>/auth/callback` as a redirect.
6. In Resend: verify the sending domain, create an API key, and paste it into Supabase
   under Authentication → SMTP. Supabase's built-in mail is capped at a couple of
   messages an hour and is not for production.

Deploy previews get their own URL per branch, which is how a change is reviewed before
it reaches anyone.

---

## What is deliberately not carried over

The original is the specification for behaviour, not for implementation. These are
departures, each made on purpose:

| Original | Here | Why |
|---|---|---|
| Identity is an email string | Foreign key to the auth account | Renaming someone re-pointed their login; sessions could not be revoked |
| `reps.email` globally unique | Unique per partner | Two partner companies could not both employ one address |
| Aggregates computed in the browser | SQL views | Reps saw leaderboards containing only themselves |
| `select *`, capped at 1,000 rows | Server-side pagination and SQL sums | Money totals silently went wrong past that |
| Activity logged before the write | `AFTER` triggers | A failed write still left a log line saying it succeeded |
| Notifications fired from the browser | Outbox table drained by a worker | Events were lost, duplicated, or forgeable by anyone |
| `confirm()` and `prompt()` | Real dialogs | Money actions deserve to show what they are about to do |
| Fonts, Excel and the DB client from three CDNs | Bundled and pinned | If any host was unreachable the app broke or silently degraded |
| `today()` in UTC, compared locally | Dates resolved in the partner's timezone | Everything shifted a day after ~7pm US Eastern |
