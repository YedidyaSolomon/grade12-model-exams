import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { clockOffset } from '@/features/exam-room/api'

export type PublicExamStream = 'natural' | 'social' | 'both'

type PublicExam = {
  title: string
  subject: string
  stream: PublicExamStream
  duration_minutes: number
  question_count: number
}

export type PublicHome = {
  server_now: string
  students: number
  exams_held: number
  live: (PublicExam & { ends_at: string })[]
  next: (PublicExam & { starts_at: string }) | null
  /** Latest RELEASED exam only. Names are already shortened server-side ("Abebe K."). */
  podium: {
    title: string
    subject: string
    rows: { rank: number; name: string | null; score: number; max_score: number }[]
  } | null
}

/** Logged-out landing page data: counts, live/next exam, podium. No personal data. */
export function usePublicHome() {
  return useQuery({
    queryKey: ['public-home'],
    queryFn: async () => {
      const t0 = Date.now()
      const { data, error } = await supabase.rpc('public_home')
      const t1 = Date.now()
      if (error) throw error
      const d = data as unknown as PublicHome
      return { ...d, offset: clockOffset(d.server_now, t0, t1) }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
