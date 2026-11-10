import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useServerClock } from '@/features/exam-room/useServerClock'
import type { OptionLetter } from '@/features/exam-room/types'

export type ResultQuestion = {
  id: string
  position: number
  body: string
  options: string[]
  image_url: string | null
  points: number
  selected_option: OptionLetter | null
  flagged: boolean
  /** only present after every window of the exam has closed */
  correct_option?: OptionLetter
  is_correct?: boolean
}

type ResultBase = {
  exam_id: string
  title: string
  subject: string
  attempt_id: string
  attempt_no: number
  submitted_at: string
  auto_submitted: boolean
  /** end of the exam's last window: when scores, ranks and answers are published */
  release_at: string | null
}

/** Before the exam closes the server returns NO score, rank or answers. */
export type MyResult =
  | (ResultBase & { released: false })
  | (ResultBase & {
      released: true
      score: number
      max_score: number
      started_at: string
      time_taken_seconds: number
      rank: number | null
      total: number | null
      questions: ResultQuestion[]
    })

export type LeaderboardRow = {
  rank: number
  full_name: string | null
  school: string | null
  score: number
  max_score: number
  time_taken_seconds: number
  is_me: boolean
}

type LeaderboardBase = { exam_id: string; title: string; release_at: string | null; server_now: string }

/** Before the exam closes the server returns no rows (admins excepted). */
export type Leaderboard =
  | (LeaderboardBase & { released: false })
  | (LeaderboardBase & { released: true; total: number; rows: LeaderboardRow[]; me: LeaderboardRow | null })

export const resultKeys = {
  mine: (examId: string) => ['student', 'result', examId] as const,
  leaderboard: (examId: string) => ['leaderboard', examId] as const,
}

export function useMyResult(examId: string) {
  return useQuery({
    queryKey: resultKeys.mine(examId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_result', { p_exam_id: examId })
      if (error) throw error
      return data as unknown as MyResult
    },
    // Fallback poll while locked; useRefetchAtRelease does the precise refresh.
    refetchInterval: (q) => (q.state.data && !q.state.data.released ? 5 * 60_000 : false),
  })
}

export function useLeaderboard(examId: string) {
  return useQuery({
    queryKey: resultKeys.leaderboard(examId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', { p_exam_id: examId, p_limit: 50 })
      if (error) throw error
      return data as unknown as Leaderboard
    },
    // Locked: slow fallback poll. Released: fallback in case Realtime is unavailable.
    refetchInterval: (q) => (q.state.data && !q.state.data.released ? 5 * 60_000 : 60_000),
  })
}

/**
 * Refetch shortly after the release time. A random 2–12 s delay spreads the load when
 * every student's page refreshes at the same moment.
 */
export function useRefetchAtRelease(releaseAt: string | null | undefined, released: boolean, refetch: () => void) {
  // Server clock, not the device's: a phone set hours off would otherwise fire too early/late.
  const { offset, synced } = useServerClock(0, 60_000)
  useEffect(() => {
    if (released || !releaseAt || !synced) return
    const ms = new Date(releaseAt).getTime() - (Date.now() + offset) + 2000 + Math.random() * 10_000
    // setTimeout overflows above ~24.8 days; the fallback poll covers that case.
    if (ms > 2_000_000_000) return
    const h = window.setTimeout(refetch, Math.max(0, ms))
    return () => window.clearTimeout(h)
  }, [releaseAt, released, refetch, offset, synced])
}

/**
 * Subscribes to the content-free 'changed' ping the database broadcasts when a result
 * appears or is re-graded, then re-fetches through the authorised RPC.
 * Debounced with jitter so hundreds of phones don't refetch in the same instant.
 */
export function useLeaderboardLive(examId: string, enabled: boolean): boolean {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    const channel = supabase
      .channel(`leaderboard:${examId}`)
      .on('broadcast', { event: 'changed' }, () => {
        if (timer !== undefined) return
        timer = window.setTimeout(() => {
          timer = undefined
          void queryClient.invalidateQueries({ queryKey: resultKeys.leaderboard(examId) })
          void queryClient.invalidateQueries({ queryKey: resultKeys.mine(examId) })
        }, 1500 + Math.random() * 3000)
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    return () => {
      window.clearTimeout(timer)
      setConnected(false)
      void supabase.removeChannel(channel)
    }
  }, [enabled, examId, queryClient])

  return connected
}
