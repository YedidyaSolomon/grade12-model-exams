import { useEffect, useRef, useState } from 'react'
import { fetchServerOffset } from './api'

/**
 * Current time on the SERVER's clock, re-rendering every `tickMs`.
 * The phone's clock may be wrong; we only use it to measure elapsed time between
 * syncs. Re-syncs every 5 minutes and when the tab becomes visible again (phones
 * freeze timers in the background).
 */
export function useServerNow(initialOffset: number, tickMs = 1000): number {
  const offsetRef = useRef(initialOffset)
  const [now, setNow] = useState(() => Date.now() + initialOffset)

  useEffect(() => {
    let cancelled = false
    const resync = () => {
      fetchServerOffset()
        .then((o) => {
          if (!cancelled) offsetRef.current = o
        })
        .catch(() => {
          /* offline: keep last known offset */
        })
    }
    const tick = window.setInterval(() => setNow(Date.now() + offsetRef.current), tickMs)
    const sync = window.setInterval(resync, 5 * 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now() + offsetRef.current)
        resync()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    resync() // one cheap call so countdowns don't rely on a wrong phone clock
    return () => {
      cancelled = true
      window.clearInterval(tick)
      window.clearInterval(sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tickMs])

  return now
}
