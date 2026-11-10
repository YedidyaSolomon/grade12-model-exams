import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isRpcError } from '@/lib/errors'
import {
  STUDENT_ERROR_CODES,
  type AttemptPayload,
  type Dashboard,
  type OptionLetter,
  type StudentErrorCode,
  type SubmitResult,
} from './types'

/** Device copy of the attempt payload, for offline reload. */
export const payloadKey = (examId: string) => `exam-payload:${examId}`

export const roomKeys = {
  dashboard: ['student', 'dashboard'] as const,
  attempt: (examId: string) => ['student', 'attempt', examId] as const,
}

/** 'already_taken' etc. for errors raised by the exam RPCs; null for anything else. */
export function studentErrorCode(e: unknown): StudentErrorCode | null {
  if (!isRpcError(e) || e.code !== 'P0001') return null
  return (STUDENT_ERROR_CODES as readonly string[]).includes(e.message) ? (e.message as StudentErrorCode) : null
}

/**
 * True when the request never got a Postgres answer (offline, DNS, timeout).
 * PostgREST/Postgres errors always carry a code; fetch failures don't.
 */
export function isNetworkError(e: unknown): boolean {
  if (!isRpcError(e)) return e instanceof TypeError
  return !e.code
}

/** Measures server clock offset using the request midpoint to cancel out latency. */
export function clockOffset(serverNowIso: string, t0: number, t1: number): number {
  return new Date(serverNowIso).getTime() - (t0 + t1) / 2
}

export function useStudentDashboard() {
  return useQuery({
    queryKey: roomKeys.dashboard,
    queryFn: async () => {
      const t0 = Date.now()
      const { data, error } = await supabase.rpc('student_dashboard')
      const t1 = Date.now()
      if (error) throw error
      const d = data as unknown as Dashboard
      return { ...d, offset: clockOffset(d.server_now, t0, t1) }
    },
    // Live / upcoming changes with the clock; refresh every minute.
    refetchInterval: 60_000,
  })
}

export type TimedPayload = AttemptPayload & { offset: number }

async function callAttemptRpc(fn: 'start_exam' | 'get_open_attempt', examId: string): Promise<TimedPayload | null> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc(fn, { p_exam_id: examId })
  const t1 = Date.now()
  if (error) throw error
  if (!data) return null
  const p = data as unknown as AttemptPayload
  return { ...p, offset: clockOffset(p.server_now, t0, t1) }
}

export const startExam = (examId: string) =>
  callAttemptRpc('start_exam', examId) as Promise<TimedPayload>
export const getOpenAttempt = (examId: string) => callAttemptRpc('get_open_attempt', examId)

export type AnswerUpdate = { question_id: string; selected_option: OptionLetter | null; flagged: boolean }

export async function saveAnswers(attemptId: string, answers: AnswerUpdate[]): Promise<void> {
  const { error } = await supabase.rpc('save_answers', { p_attempt_id: attemptId, p_answers: answers })
  if (error) throw error
}

export async function submitExam(attemptId: string, answers: AnswerUpdate[]): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('submit_exam', {
    p_attempt_id: attemptId,
    p_answers: answers,
  })
  if (error) throw error
  return data as unknown as SubmitResult
}

export async function fetchServerOffset(): Promise<number> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('server_now')
  const t1 = Date.now()
  if (error) throw error
  return clockOffset(data, t0, t1)
}
