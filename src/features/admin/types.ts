import type { Enums } from '@/lib/supabase'

export type Stream = Enums<'stream_type'>
export type ExamStream = Enums<'exam_stream'>
export type ExamState = Enums<'exam_state'>
export type ReexamStatus = Enums<'reexam_status'>
export type StudentStatus = 'active' | 'banned' | 'incomplete'

export type AuditEntry = {
  id: number
  action: string
  details: Record<string, unknown>
  created_at: string
  actor: string | null
  target?: string | null
  target_user_id?: string | null
  exam_id?: string | null
  exam_title: string | null
}

export type Overview = {
  server_now: string
  total_students: number
  banned: number
  incomplete: number
  live_exams: number
  writing_now: number
  pending_requests: number
  live: { id: string; title: string; live_ends_at: string; writing: number; submitted: number }[]
  recent_actions: AuditEntry[]
}

export type StudentRow = {
  id: string
  full_name: string | null
  school: string | null
  stream: Stream | null
  is_banned: boolean
  is_complete: boolean
  created_at: string
  email: string | null
  telegram_username: string | null
  attempt_count: number
}

export type StudentList = { total: number; rows: StudentRow[] }

export type StudentAttempt = {
  id: string
  exam_id: string
  title: string
  subject: string
  is_reexam: boolean
  attempt_no: number
  started_at: string
  deadline_at: string
  submitted_at: string | null
  auto_submitted: boolean
  score: number | null
  max_score: number | null
  rank: number | null
  total: number | null
  released: boolean
  can_grant_retake: boolean
}

export type StudentDetail = {
  id: string
  full_name: string | null
  school: string | null
  stream: Stream | null
  role: Enums<'user_role'>
  is_banned: boolean
  banned_at: string | null
  ban_reason: string | null
  is_complete: boolean
  created_at: string
  email: string | null
  telegram_username: string | null
  last_sign_in_at: string | null
  attempts: StudentAttempt[]
  retake_grants: { id: string; exam_id: string; title: string; used: boolean; used_at: string | null; note: string | null; created_at: string }[]
  requests: {
    id: string
    exam_id: string
    title: string
    reason: string
    status: ReexamStatus
    admin_note: string | null
    created_at: string
    reviewed_at: string | null
    reexam_id: string | null
  }[]
  audit: AuditEntry[]
}

export type ExamWindow = {
  id: string
  starts_at: string
  ends_at: string
  is_reopen: boolean
  restricted: boolean
  attempt_count: number
  allowed_users: { id: string; full_name: string | null }[]
}

export type ExamControl = {
  id: string
  title: string
  subject: string
  stream: ExamStream
  duration_minutes: number
  published_at: string | null
  status: ExamState
  released: boolean
  release_at: string | null
  reexam_of: string | null
  reexam_of_title: string | null
  attempt_count: number
  in_progress: number
  windows: ExamWindow[]
  retake_grants: { id: string; user_id: string; full_name: string | null; used: boolean; used_at: string | null; note: string | null; created_at: string }[]
  reexams: {
    id: string
    title: string
    published_at: string | null
    status: ExamState
    released: boolean
    student_count: number
    attempt_count: number
    created_at: string
  }[]
  reexam_students: {
    user_id: string
    full_name: string | null
    school: string | null
    request_id: string | null
    added_at: string
    has_attempt: boolean
  }[]
}

export type ResultRow = {
  attempt_id: string
  user_id: string
  rank: number | null
  full_name: string | null
  school: string | null
  stream: Stream | null
  is_banned: boolean
  score: number
  max_score: number
  percentage: number | null
  time_taken_seconds: number
  auto_submitted: boolean
  attempt_no: number
  started_at: string
  submitted_at: string
}

export type QuestionStat = {
  id: string
  position: number
  body: string
  options: string[]
  points: number
  correct_option: Enums<'answer_option'> | null
  answered: number
  correct: number
  participants: number
  counts: Record<Enums<'answer_option'>, number>
}

export type ExamResults = {
  exam: {
    id: string
    title: string
    subject: string
    stream: ExamStream
    duration_minutes: number
    status: ExamState
    reexam_of: string | null
    released: boolean
    release_at: string | null
    question_count: number
    total_points: number
  }
  in_progress: number
  rows: ResultRow[]
  questions: QuestionStat[]
}

export type ReexamRequest = {
  id: string
  exam_id: string
  exam_title: string
  exam_subject: string
  user_id: string
  full_name: string | null
  school: string | null
  stream: Stream | null
  is_banned: boolean
  reason: string
  status: ReexamStatus
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  reviewer: string | null
  reexam_id: string | null
  reexam_title: string | null
}
