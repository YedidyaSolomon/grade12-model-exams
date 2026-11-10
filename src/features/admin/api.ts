import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { examKeys } from '@/features/exams/api'
import type {
  ExamControl,
  ExamResults,
  Overview,
  ReexamRequest,
  ReexamStatus,
  Stream,
  StudentDetail,
  StudentList,
  StudentStatus,
} from './types'

/**
 * Admin data. Every call goes through an admin-only security definer RPC (checked with
 * private.require_admin() in Postgres); bans go through the admin-ban Edge Function.
 */
export const adminKeys = {
  all: ['admin'] as const,
  overview: ['admin', 'overview'] as const,
  students: (p: StudentQuery) => ['admin', 'students', p] as const,
  student: (id: string) => ['admin', 'student', id] as const,
  control: (id: string) => ['admin', 'control', id] as const,
  results: (id: string) => ['admin', 'results', id] as const,
  requests: (s: ReexamStatus | 'all') => ['admin', 'requests', s] as const,
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // The generated types know every function; this helper only narrows the Json result.
  const { data, error } = await (supabase.rpc as unknown as (
    f: string,
    a?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)(fn, args)
  if (error) throw error
  return data as T
}

/** After any admin change, refresh every admin view (they are cheap and small). */
function useInvalidateAdmin() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: adminKeys.all })
    void qc.invalidateQueries({ queryKey: examKeys.list })
  }
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: () => rpc<Overview>('admin_overview'),
    refetchInterval: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
export type StudentQuery = {
  search: string
  stream: Stream | ''
  status: StudentStatus | ''
  page: number
}
export const STUDENTS_PAGE_SIZE = 50

export function useStudents(q: StudentQuery) {
  return useQuery({
    queryKey: adminKeys.students(q),
    queryFn: () =>
      rpc<StudentList>('admin_list_students', {
        p_search: q.search.trim() || null,
        p_stream: q.stream || null,
        p_status: q.status || null,
        p_limit: STUDENTS_PAGE_SIZE,
        p_offset: q.page * STUDENTS_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.student(id ?? ''),
    enabled: !!id,
    queryFn: () => rpc<StudentDetail>('admin_get_student', { p_user_id: id }),
  })
}

export function useUpdateStudent(id: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { full_name: string; school: string; stream: Stream }) =>
      rpc('admin_update_profile', {
        p_user_id: id,
        p_full_name: v.full_name,
        p_school: v.school,
        p_stream: v.stream,
      }),
    onSuccess: invalidate,
  })
}

export type BanResult = { is_banned: boolean; closed_attempts: string[]; auth_synced: boolean }

/** Ban / unban through the Edge Function (database + auth user). */
export function useSetBan() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async (v: { userId: string; banned: boolean; reason?: string }): Promise<BanResult> => {
      const { data, error } = await supabase.functions.invoke('admin-ban', {
        body: { user_id: v.userId, banned: v.banned, reason: v.reason ?? null },
      })
      if (error) {
        // Surface the function's own message ({ error }) instead of "non-2xx status".
        if (error instanceof FunctionsHttpError) {
          let message = error.message
          try {
            const body = (await error.context.json()) as { error?: string }
            if (body.error) message = body.error
          } catch {
            /* not JSON */
          }
          throw new Error(message)
        }
        throw error
      }
      return data as BanResult
    },
    onSettled: invalidate,
  })
}

// ---------------------------------------------------------------------------
// Exam control: windows, retakes, re-exams
// ---------------------------------------------------------------------------
export function useExamControl(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.control(id ?? ''),
    enabled: !!id,
    queryFn: () => rpc<ExamControl>('admin_exam_control', { p_exam_id: id }),
    refetchInterval: 60_000,
  })
}

export function useExtendWindow() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { windowId: string; endsAt: string }) =>
      rpc<{ extended_attempts: number }>('admin_extend_window', { p_window_id: v.windowId, p_ends_at: v.endsAt }),
    onSuccess: invalidate,
  })
}

export function useAddWindow() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { examId: string; startsAt: string; endsAt: string; userIds: string[] }) =>
      rpc<string>('admin_add_window', {
        p_exam_id: v.examId,
        p_starts_at: v.startsAt,
        p_ends_at: v.endsAt,
        p_user_ids: v.userIds.length ? v.userIds : null,
      }),
    onSuccess: invalidate,
  })
}

export function useGrantRetake() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { examId: string; userId: string; note?: string }) =>
      rpc<string>('admin_grant_retake', { p_exam_id: v.examId, p_user_id: v.userId, p_note: v.note ?? null }),
    onSuccess: invalidate,
  })
}

export function useRevokeRetake() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (grantId: string) => rpc('admin_revoke_retake', { p_grant_id: grantId }),
    onSuccess: invalidate,
  })
}

export function useCreateReexam() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (examId: string) => rpc<string>('admin_create_reexam', { p_exam_id: examId }),
    onSuccess: invalidate,
  })
}

export function useAddReexamStudents() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { reexamId: string; userIds: string[] }) =>
      rpc<number>('admin_add_reexam_students', { p_reexam_id: v.reexamId, p_user_ids: v.userIds }),
    onSuccess: invalidate,
  })
}

export function useRemoveReexamStudent() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { reexamId: string; userId: string }) =>
      rpc('admin_remove_reexam_student', { p_reexam_id: v.reexamId, p_user_id: v.userId }),
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export function useExamResults(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.results(id ?? ''),
    enabled: !!id,
    queryFn: () => rpc<ExamResults>('admin_exam_results', { p_exam_id: id }),
    refetchInterval: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Re-exam requests
// ---------------------------------------------------------------------------
export function useReexamRequests(status: ReexamStatus | 'all') {
  return useQuery({
    queryKey: adminKeys.requests(status),
    queryFn: () =>
      rpc<ReexamRequest[]>('admin_list_reexam_requests', { p_status: status === 'all' ? null : status }),
  })
}

export function useReviewRequest() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (v: { requestId: string; approve: boolean; note?: string }) =>
      rpc<{ reexam_id: string | null; created_reexam: boolean }>('admin_review_reexam_request', {
        p_request_id: v.requestId,
        p_approve: v.approve,
        p_note: v.note ?? null,
      }),
    onSuccess: invalidate,
  })
}
