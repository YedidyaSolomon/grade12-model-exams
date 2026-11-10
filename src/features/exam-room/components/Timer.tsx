import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'

const TEN_MIN = 10 * 60_000
const FIVE_MIN = 5 * 60_000

export function Timer({ remainingMs }: { remainingMs: number }) {
  const { t } = useTranslation()
  const level = remainingMs <= FIVE_MIN ? 'red' : remainingMs <= TEN_MIN ? 'amber' : 'normal'
  const minutesLeft = Math.ceil(Math.max(0, remainingMs) / 60_000)

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-base font-semibold tabular-nums',
        level === 'normal' && 'bg-muted',
        level === 'amber' && 'bg-warning/25 text-foreground',
        level === 'red' && 'bg-destructive text-destructive-foreground',
      )}
      role="timer"
      aria-label={t('room.timeLeftLabel', { count: minutesLeft })}
    >
      <Clock className="size-4" aria-hidden />
      <span aria-hidden>{formatDuration(remainingMs)}</span>
      {/* Screen readers: announce only at the warning thresholds, not every second. */}
      <span className="sr-only" aria-live="assertive">
        {level === 'amber' && minutesLeft === 10 ? t('room.tenMinutesLeft') : ''}
        {level === 'red' && minutesLeft === 5 ? t('room.fiveMinutesLeft') : ''}
      </span>
    </div>
  )
}
