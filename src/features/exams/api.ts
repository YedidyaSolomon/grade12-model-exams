import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/database.types'
import { eatInputToIso, isoToEatInput } from '@/lib/time'
import type { AdminExam, ExamDraft, OptionLetter } from './types'
import { newQuestionKey } from './types'

export const examKeys = {
  list: ['admin', 'exams'] as const,
  detail: (id: string) => ['admin', 'exam', id] as const,
}

// ---------------------------------------------------------------------------
// Draft <-> payload
// ---------------------------------------------------------------------------
export function draftToPayload(draft: ExamDraft, publish: boolean): Json {
  const starts = eatInputToIso(draft.windowStart)
  const ends = eatInputToIso(draft.windowEnd)
  const questions = [...draft.questions]
    .sort((a, b) => a.number - b.number)
    .map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      body: q.body.trim(),
      options: q.options.map((o) => o.trim()),
      correct_option: q.correct,
      points: q.points,
      image_url: q.image_url,
    }))
  return {
    title: draft.title.trim(),
    subject: draft.subject.trim(),
    stream: draft.stream,
    duration_minutes: Number(draft.duration),
    publish,
    source_file: draft.sourceFile,
    window: starts && ends ? { starts_at: starts, ends_at: ends } : null,
    questions,
  }
}

export function adminExamToDraft(exam: AdminExam): ExamDraft {
  return {
    title: exam.title,
    subject: exam.subject,
    stream: exam.stream,
    duration: String(exam.duration_minutes),
    windowStart: exam.window ? isoToEatInput(exam.window.starts_at) : '',
    windowEnd: exam.window ? isoToEatInput(exam.window.ends_at) : '',
    sourceFile: exam.source_file,
    questions: exam.questions.map((q) => ({
      key: newQuestionKey(),
      id: q.id,
      number: q.position,
      body: q.body,
      options: q.options,
      correct: q.correct_option,
      points: q.points,
      image_url: q.image_url,
    })),
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function useAdminExams() {
  return useQuery({
    queryKey: examKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_exams')
      if (error) throw error
      return data
    },
    // Status is derived from the clock; refresh so Scheduled -> Live -> Closed updates.
    refetchInterval: 60_000,
  })
}

export function useAdminExam(id: string | undefined) {
  return useQuery({
    queryKey: examKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_exam', { p_exam_id: id! })
      if (error) throw error
      return data as unknown as AdminExam
    },
    // Never let a background refetch overwrite what the admin is editing.
    staleTime: Infinity,
    refetchOnReconnect: false,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function useInvalidateExams() {
  const qc = useQueryClient()
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: examKeys.list })
    if (id) void qc.invalidateQueries({ queryKey: examKeys.detail(id) })
  }
}

export function useCreateExam() {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: async ({ draft, publish }: { draft: ExamDraft; publish: boolean }) => {
      const { data, error } = await supabase.rpc('create_exam', {
        payload: draftToPayload(draft, publish),
      })
      if (error) throw error
      return data
    },
    onSuccess: (id) => invalidate(id),
  })
}

export function useUpdateExam(id: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: async ({ draft, publish }: { draft: ExamDraft; publish: boolean }) => {
      const { error } = await supabase.rpc('update_exam', {
        p_exam_id: id,
        payload: draftToPayload(draft, publish),
      })
      if (error) throw error
    },
    onSuccess: () => invalidate(id),
  })
}

export function useUpdateAnswerKeys(id: string) {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: async (keys: { question_id: string; correct_option: OptionLetter }[]) => {
      const { data, error } = await supabase.rpc('update_answer_keys', {
        p_exam_id: id,
        p_keys: keys,
      })
      if (error) throw error
      return data as { changed: number; regraded: number }
    },
    onSuccess: () => invalidate(id),
  })
}

export function useDeleteExam() {
  const invalidate = useInvalidateExams()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_exam', { p_exam_id: id })
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

// ---------------------------------------------------------------------------
// Question images (public bucket, admin-only write via storage RLS)
// ---------------------------------------------------------------------------
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export async function uploadQuestionImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG, WebP or GIF image.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be 2 MB or smaller.')
  const ext = file.type.split('/')[1] ?? 'png'
  const path = `${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`
  const { error } = await supabase.storage
    .from('question-images')
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) throw error
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl
}
