import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

export type MyResult = {
  exam_id: string
  title: string
  subject: string
  attempt_id: string
  attempt_no: number
  score: number
  max_score: number
  started_at: string
  submitted_at: string
  auto_submitted: boolean
  time_taken_seconds: number
  rank: number | null
  total: number | null
  revealed: boolean
  reveal_at: string | null
  questions: ResultQuestion[]
}

export type LeaderboardRow = {
  rank: number
  full_name: string | null
  school: string | null
  score: number
  max_score: number
  time_taken_seconds: number
  is_me: boolean
}

export type Leaderboard = {
  exam_id: string
  title: string
  total: number
  rows: LeaderboardRow[]
  me: LeaderboardRow | null
  server_now: string
}

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
    // Until answers are revealed, check again each minute (rank also moves while others submit).
    refetchInterval: (q) => (q.state.data && !q.state.data.revealed ? 60_000 : false),
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
    refetchInterval: 60_000, // fallback if Realtime is unavailable
  })
}

/**
 * Subscribes to the content-free 'changed' ping the database broadcasts when a result
 * appears or is re-graded, then re-fetches through the authorised RPC.
 * Debounced with jitter so hundreds of phones don't refetch in the same instant.
 */
export function useLeaderboardLive(examId: string): boolean {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
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
      void supabase.removeChannel(channel)
    }
  }, [examId, queryClient])

  return connected
}
