import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { ExamState } from '../types'

const VARIANT = {
  draft: 'secondary',
  scheduled: 'warning',
  live: 'live',
  closed: 'outline',
} as const satisfies Record<ExamState, string>

export function StatusBadge({ status }: { status: ExamState }) {
  const { t } = useTranslation()
  return (
    <Badge variant={VARIANT[status]}>
      {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {t(`exams.status.${status}`)}
    </Badge>
  )
}
