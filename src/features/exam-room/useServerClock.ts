import { useEffect, useRef, useState } from 'react'
import { fetchServerOffset } from './api'

export type ServerClock = {
  /** current time on the SERVER's clock (ms since epoch) */
  now: number
  /** server time minus device time, in ms */
  offset: number
  /** true once the offset has been measured at least once in this mount */
  synced: boolean
}

/**
 * The server's clock, re-rendering every `tickMs`. Device clocks can be hours off, so
 * every time-based decision in the UI must use this, never Date.now() directly.
 * Measures the offset on mount, every 5 minutes, and whenever the tab becomes visible
 * (phones freeze timers in the background).
 */
export function useServerClock(initialOffset = 0, tickMs = 1000): ServerClock {
  const offsetRef = useRef(initialOffset)
  const [state, setState] = useState<ServerClock>(() => ({
    now: Date.now() + initialOffset,
    offset: initialOffset,
    synced: false,
  }))

  useEffect(() => {
    let cancelled = false
    const resync = () => {
      fetchServerOffset()
        .then((o) => {
          if (cancelled) return
          offsetRef.current = o
          setState({ now: Date.now() + o, offset: o, synced: true })
        })
        .catch(() => {
          /* offline: keep last known offset */
        })
    }
    const tick = window.setInterval(
      () => setState((s) => ({ ...s, now: Date.now() + offsetRef.current })),
      tickMs,
    )
    const sync = window.setInterval(resync, 5 * 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }
    document.addEventListener('visibilitychange', onVisible)
    resync()
    return () => {
      cancelled = true
      window.clearInterval(tick)
      window.clearInterval(sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tickMs])

  return state
}

/** Shorthand: just the server's current time. */
export function useServerNow(initialOffset = 0, tickMs = 1000): number {
  return useServerClock(initialOffset, tickMs).now
}
