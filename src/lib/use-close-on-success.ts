'use client'

import { useState } from 'react'

/**
 * Close a confirm dialog once its action state reports success.
 *
 * Every dialog in the app used the same `useEffect(() => { if (state.ok)
 * setOpen(false) }, [state.ok])` — which `eslint-plugin-react-hooks`'
 * `react-hooks/set-state-in-effect` rule flags: calling setState synchronously
 * inside an effect body causes an extra render pass, and React's own docs
 * recommend adjusting state during render instead for exactly this shape
 * ("reset state when a prop changes") — see
 * https://react.dev/learn/you-might-not-need-an-effect. That rule only started
 * actually running this session (it was previously masked by a crashing CI
 * lint step, fixed separately), which is when every one of these surfaced at
 * once — none of them are new.
 *
 * This does the render-time adjustment once, centrally, the same way
 * use-resilient-action.ts centralizes the retry logic every mutation uses.
 */
export function useCloseOnSuccess(ok: string | undefined, setOpen: (open: boolean) => void) {
  const [seen, setSeen] = useState(ok)
  if (ok !== seen) {
    setSeen(ok)
    if (ok) setOpen(false)
  }
}
