import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ExamState } from '../types'

/** Status pills: draft = gold, scheduled = navy, live = red, closed = grey. */
const TONE = {
  draft: 'bg-gold-soft text-gold-foreground',
  scheduled: 'bg-primary-soft text-primary',
  live: 'bg-live-soft text-live',
  closed: 'bg-muted text-muted-foreground',
} as const satisfies Record<ExamState, string>

export function StatusBadge({ status }: { status: ExamState }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap',
        TONE[status],
      )}
    >
      {status === 'live' && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />}
      {t(`exams.status.${status}`)}
    </span>
  )
}
