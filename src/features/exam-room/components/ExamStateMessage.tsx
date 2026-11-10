import { useTranslation } from 'react-i18next'
import { Ban, CalendarClock, CheckCircle2, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatCountdown, formatEAT } from '@/lib/time'
import type { DashboardExam } from '../types'

/** What a student can do with an exam right now, derived from server data. */
export type ExamAvailability =
  | { kind: 'resume' }
  | { kind: 'start'; retake: boolean }
  | { kind: 'upcoming'; startsAt: string }
  | { kind: 'taken' }
  | { kind: 'closed' }

export function availability(e: DashboardExam, nowMs: number): ExamAvailability {
  const a = e.attempt
  if (a && !a.submitted_at && new Date(a.deadline_at).getTime() + 30_000 > nowMs) return { kind: 'resume' }
  const submitted = !!a?.submitted_at
  if (e.status === 'live' && (!a || e.has_retake)) return { kind: 'start', retake: submitted && e.has_retake }
  if (e.status === 'scheduled' && e.next_starts_at && (!submitted || e.has_retake))
    return { kind: 'upcoming', startsAt: e.next_starts_at }
  if (a) return { kind: 'taken' }
  return { kind: 'closed' }
}

/** The plain-language state messages from the spec. */
export function ExamStateMessage({ exam, av, nowMs }: { exam: DashboardExam; av: ExamAvailability; nowMs: number }) {
  const { t } = useTranslation()
  let icon: ReactNode
  let text: string
  switch (av.kind) {
    case 'upcoming':
      icon = <CalendarClock className="size-5" aria-hidden />
      text = t('state.startsIn', {
        countdown: formatCountdown(new Date(av.startsAt).getTime() - nowMs),
        time: formatEAT(av.startsAt),
      })
      break
    case 'taken':
      icon = <CheckCircle2 className="size-5 text-success" aria-hidden />
      text = t('state.alreadyTaken')
      break
    case 'closed':
      icon = <Lock className="size-5" aria-hidden />
      text = exam.reexam_pending ? t('state.reexamPending') : t('state.closedRequest')
      break
    default:
      return null
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      {icon}
      {text}
    </p>
  )
}

export function SuspendedMessage() {
  const { t } = useTranslation()
  return (
    <p className="flex items-center gap-2 text-sm text-destructive">
      <Ban className="size-5" aria-hidden /> {t('suspended.title')}: {t('suspended.body')}
    </p>
  )
}
