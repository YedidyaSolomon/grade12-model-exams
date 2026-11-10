import type { Enums } from '@/lib/supabase'

export type OptionLetter = Enums<'answer_option'>
export type ExamStream = Enums<'exam_stream'>
export type ExamState = Enums<'exam_state'>

export const OPTION_LETTERS: readonly OptionLetter[] = ['A', 'B', 'C', 'D'] as const

/** A question as edited in the admin UI (manual entry now, file upload in Phase 6). */
export type DraftQuestion = {
  /** client-side identity for React keys / editing */
  key: string
  /** database id when editing an existing question */
  id?: string
  /** number as entered / parsed from a file; gaps and duplicates are flagged */
  number: number
  body: string
  /** should be exactly 4; uploads may produce other counts, which are flagged */
  options: string[]
  correct: OptionLetter | null
  points: number
  image_url: string | null
}

export type ExamDraft = {
  title: string
  subject: string
  stream: ExamStream
  /** kept as string so the input can be empty while typing */
  duration: string
  /** datetime-local values, interpreted as EAT */
  windowStart: string
  windowEnd: string
  sourceFile: string | null
  questions: DraftQuestion[]
}

/** Shape returned by the admin_get_exam RPC. */
export type AdminExam = {
  id: string
  title: string
  subject: string
  stream: ExamStream
  duration_minutes: number
  published_at: string | null
  source_file: string | null
  created_at: string
  updated_at: string
  status: ExamState
  released: boolean
  /** set for a re-exam: the original exam it was copied from */
  reexam_of: string | null
  reexam_of_title: string | null
  reexam_student_count: number
  attempt_count: number
  window: { id: string; starts_at: string; ends_at: string } | null
  questions: {
    id: string
    position: number
    body: string
    options: string[]
    image_url: string | null
    points: number
    correct_option: OptionLetter | null
  }[]
}

export function newQuestionKey(): string {
  return crypto.randomUUID()
}

export function emptyQuestion(number: number): DraftQuestion {
  return {
    key: newQuestionKey(),
    number,
    body: '',
    options: ['', '', '', ''],
    correct: null,
    points: 1,
    image_url: null,
  }
}

export function emptyDraft(): ExamDraft {
  return {
    title: '',
    subject: '',
    stream: 'both',
    duration: '120',
    windowStart: '',
    windowEnd: '',
    sourceFile: null,
    questions: [],
  }
}
