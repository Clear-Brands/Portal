# Build plan

Phases 00 and 01 are done and in the repository. What follows is enough detail
that a fresh session can pick up any phase without re-deriving the architecture.

**Read first, always:** `README.md` (how it fits together), then the files named
under "Patterns to copy" for whichever phase you're on. Do not read the original
`index.html` — everything worth knowing from it is already captured here.

---

## Ground rules for every phase

These are settled. Don't relitigate them, and don't work around them.

1. **The browser never writes.** All mutations are server actions in
   `src/lib/actions/*`. All reads are server components calling `src/lib/data/*`.
   `createAdminClient()` is for auth admin, the outbox worker and webhooks only —
   ESLint blocks it elsewhere.
2. **Permission is checked twice.** `can(profile, 'x.y')` in the action before
   anything runs, and an RLS policy gating the same capability underneath. A new
   capability means editing **both** `src/lib/auth/capabilities.ts` and
   `capability_default()` in `0007_access.sql`; `npm test` fails if they drift.
3. **No money in JavaScript.** Totals are SQL aggregates or database functions.
   If you're writing `.reduce((a, b) => a + b.amount, 0)` over rows fetched for
   display, that's fine; if the result is a figure someone will act on, it
   belongs in SQL.
4. **Nothing unbounded.** Every list paginates server-side. If a surface caps
   what it shows, it says so on screen — see the pipeline column footer.
5. **No `confirm()` or `prompt()`.** Use `ConfirmDialog` from
   `src/components/dialog.tsx`. Money and destructive actions state the amount
   and the affected people before committing.
6. **Dates come from the partner.** `partnerToday()` in TypeScript,
   `partner_today(partner_id)` in SQL. Never `new Date()` for a business date.
7. **Migrations are append-only.** New file, next number. Never edit a migration
   that has been applied anywhere.
8. **Finish by running `npm run verify`.** Typecheck, capability parity,
   migrations against an empty database, RLS assertions, production build.

---

## Phase 02 — Programs

Competitions, team sprints, annual goals, prize tracking.

**The schema already exists** (`0005_programs.sql`) and so do the standings
views (`0009_views.sql`): `v_competition_standings`, `v_sprint_team_standings`,
`v_sprint_overall`, `v_annual_goal_standings`. They already handle visibility —
a member reads standings without reading anyone's deals. **Do not compute
standings in TypeScript.** That was the single worst defect in the original.

Build:

- `/programs` — running and past competitions and sprints, as cards with live
  standings. Members see only visible ones (the view enforces this).
- `/programs/new` — create a competition or sprint. `min_closes` is required and
  at least 1. A sprint needs two or more pods. Both constraints are in the
  database; surface them as form validation too so the error arrives early.
- `/programs/prizes` — `prizeLineRows` equivalent: who is owed what, with status
  Leading / Locked in / Awaiting approval / Approved. Excel export.
- Annual goal standings with progress bars, and an **Approve** action writing
  `goal_awards` — gated on `payouts.write`, because approving a prize commits
  money.

**Patterns to copy:** `src/app/(portal)/payouts/page.tsx` for card layout and
capability gating; `src/app/(portal)/deals/deal-actions.tsx` for a confirm
dialog wrapping a server action; `src/app/api/export/payable/route.ts` for a
grouped export.

**Watch for:** a competition ending mid-window, ties (the views already break on
spiff total then name), and reps below `min_closes` — they stay on the board but
no prize attaches.

---

## Phase 03 — Rev share, roster, activity

**Rev share.** Schema and RPCs exist (`0004_money.sql`, `0010_rpcs.sql`:
`record_revshare`, `void_revshare`).

- `/revshare` — live accounts (deals with `monthly_value > 0` and
  `live is not false`), the accruing total, mark live/churned, and add a closed
  client to the programme.
- Recording a statement: same dialog treatment as `RecordPayoutButton`. The
  total comes from `record_revshare`, never from the form.
- History with per-client line items, void with a reason.

**Roster.** `v_person_stats` gives per-person production already aggregated.

- `/roster` — search, pod tabs with counts, active/inactive, sort by name, sent,
  closes or spiffs, paginated 10/25/50/100. Server-side, all of it.
- Edit a person (name, email, pod), deactivate, enable a portal login.
- CSV bulk import with a validation preview: per-row rejection reasons, and an
  optional "also create logins". Port the parser rules from the original —
  header auto-detection, positional fallback, duplicate handling.
- **Deactivation is a pause, not a forfeiture.** Earned money stays payable.

**Activity.** `/activity` — search, kind filter, paginated. Read-only by
construction; there is no insert policy and no update or delete policy at all.

**Patterns to copy:** `src/app/(portal)/deals/page.tsx` (filters in the URL,
server-side paging, summary from SQL) and `src/app/(portal)/deals/filter-bar.tsx`.

---

## Phase 04 — Partners, permissions UI, hardening

- `/partners` — the whole book, with `v_partner_rollup`. Onboard a partner
  (creates partner, pods and their admin login together), archive and restore.
  The last active partner cannot be archived.
- Partner settings: default spiff, per-close compensation, rev-share rate,
  feature toggles. All behind `rates.write` / `partners.write`.
- Permission management for Clear Brands staff and partner admins, rendering
  from `CAPABILITIES` so the grid can never list a capability that does nothing.
- Rate limiting on `/login` and the webhook route.
- Extend `supabase/tests/20_rls.sql` with a case for every new policy.

**This phase is the gate.** Nothing is deployed before it passes.

---

## Phase 05 — Polish

Loading skeletons on every async surface, empty states that say what to do next,
mobile (tables become cards below `sm`), `aria-current` on the active nav item,
Playwright end-to-end tests for the three main journeys, and a consistency pass
on number and date formatting.

---

## Phase 06 — Staging

Two Supabase projects. `supabase link` then `supabase db push`. Connect the repo
in Netlify. Set the environment variables listed at the top of `netlify.toml`.
Verify a domain in Resend and paste the key into Supabase → Authentication →
SMTP. Seed realistic data, create logins for the client, and hand over the URL.

## Phase 07 — Production

Same again against the production project, plus a custom domain, Sentry, and a
restore rehearsal from the nightly dump before anyone is invited.

## Phase 08 — Automation

The GHL invoice-paid webhook that moves a deal to payable on its own. The
plumbing exists: `webhook_events` stores inbound payloads raw with an
idempotency key, `event_outbox` queues outbound events written in the same
transaction as the change. What's left is the route handler with signature
verification, and the worker that drains the outbox with retries.

---

## Cost note

Phases 02, 03 and 05 are pattern-following against surfaces that already exist —
a smaller model handles them well. Phase 04 touches permissions and phase 07
touches production; those are worth the larger model and a careful read.
