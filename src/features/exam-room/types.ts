import type { Enums } from '@/lib/supabase'

export type OptionLetter = Enums<'answer_option'>
export const LETTERS: readonly OptionLetter[] = ['A', 'B', 'C', 'D']

/** Returned by start_exam / get_open_attempt. Contains no answer keys. */
export type AttemptPayload = {
  attempt_id: string
  attempt_no: number
  exam_id: string
  title: string
  subject: string
  duration_minutes: number
  started_at: string
  deadline_at: string
  server_now: string
  questions: {
    id: string
    position: number
    body: string
    options: string[]
    image_url: string | null
    points: number
  }[]
  answers: { question_id: string; selected_option: OptionLetter | null; flagged: boolean }[]
}

export type AnswerState = { option: OptionLetter | null; flagged: boolean }

export type DashboardExam = {
  id: string
  title: string
  subject: string
  stream: Enums<'exam_stream'>
  duration_minutes: number
  status: 'live' | 'scheduled' | 'closed'
  live_ends_at: string | null
  next_starts_at: string | null
  last_ends_at: string | null
  question_count: number
  total_points: number
  attempt: {
    id: string
    attempt_no: number
    started_at: string
    deadline_at: string
    submitted_at: string | null
    auto_submitted: boolean
    /** score / rank fields are only present once results are released */
    score?: number | null
    max_score?: number | null
    rank?: number | null
    total?: number | null
  } | null
  has_retake: boolean
  reexam_pending: boolean
  /** a re-exam this student was approved for */
  is_reexam: boolean
  /** the student's latest re-exam request for this exam */
  reexam_request: {
    status: Enums<'reexam_status'>
    admin_note: string | null
    created_at: string
    reviewed_at: string | null
  } | null
  /** closed, never started, no pending/approved request (checked again by request_reexam) */
  can_request_reexam: boolean
  /** every window has ended: scores, ranks and answers are published */
  released: boolean
  /** when results are published (end of the last window) */
  results_at: string | null
}

export type Dashboard = { server_now: string; banned: boolean; exams: DashboardExam[] }

export type SubmitResult = { submitted_at: string; auto_submitted: boolean; late: boolean; already: boolean }

/** Machine codes raised by the exam RPCs (P0001 + message). */
export const STUDENT_ERROR_CODES = [
  'not_authenticated',
  'banned',
  'profile_incomplete',
  'exam_not_found',
  'not_open',
  'already_taken',
  'time_up',
  'attempt_not_found',
  'already_submitted',
  'invalid_answers',
  'no_result',
  // request_reexam
  'not_closed',
  'request_pending',
  'request_approved',
  'invalid_reason',
] as const
export type StudentErrorCode = (typeof STUDENT_ERROR_CODES)[number]

/** Reason categories for a re-exam request (enum public.reexam_reason). */
export const REEXAM_REASONS = ['network_power', 'illness', 'device', 'other'] as const satisfies readonly Enums<'reexam_reason'>[]
export type ReexamReason = (typeof REEXAM_REASONS)[number]
