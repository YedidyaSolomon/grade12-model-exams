import { useCallback, useEffect, useRef, useState } from 'react'
import { safeStorage } from '@/lib/storage'
import { isNetworkError, saveAnswers, studentErrorCode, type AnswerUpdate } from './api'
import type { StudentErrorCode } from './types'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'closed'
type QueueEntry = AnswerUpdate & { t: number }
type Queue = Record<string, QueueEntry>

export const queueKey = (attemptId: string) => `exam-queue:${attemptId}`

/** Answers recorded on this device but not yet confirmed by the server. */
export function readQueue(attemptId: string): Queue {
  return safeStorage.get<Queue>(queueKey(attemptId)) ?? {}
}

const CLOSED_CODES: StudentErrorCode[] = ['time_up', 'already_submitted', 'attempt_not_found', 'banned']

/**
 * Offline-first answer saving.
 * - Every tap is written to a localStorage queue first (one entry per question, latest wins),
 *   so nothing is lost on reload, phone restart or dropped connection.
 * - The queue is flushed in one batch RPC; taps during a flush are sent right after.
 * - Network failures retry with backoff and on the browser 'online' / tab-visible events.
 * - Server refusals that mean "this attempt is over" stop syncing and call onClosed.
 */
export function useAnswerSync(attemptId: string, onClosed: (code: StudentErrorCode) => void) {
  const queue = useRef<Queue>(readQueue(attemptId))
  const inFlight = useRef(false)
  const retryTimer = useRef<number | undefined>(undefined)
  const retryDelay = useRef(2000)
  const closed = useRef(false)
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed

  const [status, setStatus] = useState<SyncStatus>(() =>
    Object.keys(queue.current).length ? (navigator.onLine ? 'saving' : 'offline') : 'idle',
  )
  const [pendingCount, setPendingCount] = useState(() => Object.keys(queue.current).length)

  const persist = useCallback(() => {
    safeStorage.set(queueKey(attemptId), queue.current)
    setPendingCount(Object.keys(queue.current).length)
  }, [attemptId])

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(retryTimer.current)
    if (inFlight.current || closed.current) return
    const entries = Object.values(queue.current)
    if (entries.length === 0) return
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }

    inFlight.current = true
    setStatus('saving')
    try {
      await saveAnswers(attemptId, entries.map(({ t: _t, ...a }) => a))
      // Remove only what we sent; newer taps on the same question stay queued.
      for (const e of entries) {
        if (queue.current[e.question_id]?.t === e.t) delete queue.current[e.question_id]
      }
      persist()
      retryDelay.current = 2000
      inFlight.current = false
      if (Object.keys(queue.current).length) void flush()
      else setStatus('saved')
    } catch (e) {
      inFlight.current = false
      const code = studentErrorCode(e)
      if (code && CLOSED_CODES.includes(code)) {
        closed.current = true
        setStatus('closed')
        onClosedRef.current(code)
        return
      }
      setStatus(isNetworkError(e) || !navigator.onLine ? 'offline' : 'error')
      retryTimer.current = window.setTimeout(() => void flush(), retryDelay.current)
      retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
    }
  }, [attemptId, persist])

  const record = useCallback(
    (u: AnswerUpdate) => {
      if (closed.current) return
      queue.current[u.question_id] = { ...u, t: Date.now() }
      persist()
      void flush()
    },
    [flush, persist],
  )

  /** Everything not yet confirmed, for submit_exam to save atomically. */
  const pending = useCallback((): AnswerUpdate[] => Object.values(queue.current).map(({ t: _t, ...a }) => a), [])

  const clear = useCallback(() => {
    closed.current = true
    window.clearTimeout(retryTimer.current)
    queue.current = {}
    safeStorage.remove(queueKey(attemptId))
  }, [attemptId])

  useEffect(() => {
    const kick = () => {
      retryDelay.current = 2000
      void flush()
    }
    const onOffline = () => setStatus('offline')
    const onVisible = () => document.visibilityState === 'visible' && kick()
    window.addEventListener('online', kick)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const safety = window.setInterval(kick, 15_000) // in case 'online' never fires
    void flush() // answers left over from a previous session
    return () => {
      window.removeEventListener('online', kick)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(safety)
      window.clearTimeout(retryTimer.current)
    }
  }, [flush])

  return { status, pendingCount, record, flush, pending, clear }
}
