'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { updatePartnerRates } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'
import type { Partner } from '@/lib/types'

const initial: ActionState = {}

export function PartnerRatesForm({ partner }: { partner: Partner }) {
  const [state, action, pending] = useActionState(updatePartnerRates, initial)
  const [compMode, setCompMode] = useState(partner.compMode)

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="partnerId" value={partner.id} />

      <Field label="Default spiff" hint="What a rep's referral pays when they submit it.">
        <input
          name="defaultSpiff"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={partner.defaultSpiff}
          className={inputClass}
        />
      </Field>

      {/*
        This field is genuinely dual-purpose: it's always the rate the
        monthly Rev share statement bills live accounts at (see
        revshare_statements / revshare_pct in 0018), independent of comp
        mode entirely — and it is ALSO, only when compMode is
        'ongoing_pct', the rate a newly-approved deal's ongoing comp uses.
        It used to also show whenever partner.revshareEnabled (the "Rev
        share" Feature toggle) was on, but that toggle is an unrelated
        concern — whether the partner's portal shows a Rev share tab at
        all — and showing this field because of it let Rev-share % surface
        on the rates form for partners with no ongoing_pct comp, which
        reads as "this partner has a negotiated rev-share rate" even when
        they don't. Rev-share is meant to be a negotiation lever Clear
        Brands offers selectively, not something visible by default
        (Cristian's "Revshare Partner Settings and Negotiation Logic"
        walkthrough, Sept 2026) — so visibility here now follows comp mode
        alone. The stored rate itself is untouched when hidden (a hidden
        input still carries it forward), since the monthly statement still
        needs it independent of comp mode; only this form's visibility of
        it changed.
      */}
      {compMode === 'ongoing_pct' ? (
        <Field
          label="Rev-share %"
          hint="The rate below applies here too — this is what &ldquo;Percentage of ongoing rev share&rdquo; pays, once a deal is approved."
        >
          <input
            name="revsharePct"
            type="number"
            min={0}
            max={100}
            step="0.001"
            required
            defaultValue={partner.revsharePct}
            className={inputClass}
          />
        </Field>
      ) : (
        <input type="hidden" name="revsharePct" value={partner.revsharePct} />
      )}

      <Field label="Partner compensation">
        <select
          name="compMode"
          value={compMode}
          onChange={(e) => setCompMode(e.target.value as Partner['compMode'])}
          className={inputClass}
        >
          <option value="none">None</option>
          <option value="flat">Flat amount per close</option>
          <option value="pct">Percentage per close</option>
          <option value="ongoing_pct">Percentage of ongoing rev share</option>
        </select>
      </Field>

      {compMode === 'ongoing_pct' ? (
        <p className="-mt-2 text-[12.5px] text-muted">
          No one-time company payout for this mode. Once a deal closes, it holds for a one-time
          approval on Payouts — same as flat-fee — and then joins the ongoing monthly rev-share
          programme at the rate above, exactly like adding an account by hand on the Rev share page.
        </p>
      ) : null}

      {/*
        compFlat and compPct must both be present in every submission — the
        server's UpdateRates schema requires both as numbers, since
        compute_partner_comp() only reads whichever one comp_mode picks out,
        so there's no harm in always sending both. Whichever one isn't the
        active mode's field falls back to a hidden input carrying its last
        saved value forward, so switching modes and back doesn't lose it.
        (Rendering only the active field with no fallback for the other was
        the bug: picking "Flat amount per close" left no compPct field in the
        form at all, so submitting failed every time with "Invalid input:
        expected number, received NaN" — the rate could never actually be saved.)
      */}
      {compMode === 'flat' ? (
        <Field label="Flat amount">
          <input
            name="compFlat"
            type="number"
            min={0}
            step="0.01"
            defaultValue={partner.compFlat}
            className={inputClass}
          />
        </Field>
      ) : (
        <input type="hidden" name="compFlat" value={partner.compFlat} />
      )}

      {compMode === 'pct' ? (
        <Field label="Percentage">
          <input
            name="compPct"
            type="number"
            min={0}
            max={100}
            step="0.001"
            defaultValue={partner.compPct}
            className={inputClass}
          />
        </Field>
      ) : (
        <input type="hidden" name="compPct" value={partner.compPct} />
      )}

      {compMode === 'flat' || compMode === 'pct' ? (
        <Field label="Basis">
          <select name="compBasis" defaultValue={partner.compBasis} className={inputClass}>
            <option value="first_month">First month&rsquo;s value</option>
            <option value="contract">Full contract value</option>
          </select>
        </Field>
      ) : (
        <input type="hidden" name="compBasis" value={partner.compBasis} />
      )}

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save rates'}
        </Button>
      </div>
    </form>
  )
}
