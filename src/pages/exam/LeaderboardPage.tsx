import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Lock, Medal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatCountdown, formatDuration, formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { studentErrorCode } from '@/features/exam-room/api'
import { useServerNow } from '@/features/exam-room/useServerClock'
import {
  useLeaderboard,
  useLeaderboardLive,
  useRefetchAtRelease,
  type Leaderboard,
  type LeaderboardRow,
} from '@/features/results/api'

export default function LeaderboardPage() {
  const { examId = '' } = useParams()
  const { t } = useTranslation()
  const lb = useLeaderboard(examId)
  const released = lb.data?.released ?? false
  // Realtime only once results are public; before that there is nothing to update.
  const live = useLeaderboardLive(examId, released)
  const { refetch: refetchLb } = lb
  const refetch = useCallback(() => void refetchLb(), [refetchLb])
  useRefetchAtRelease(lb.data?.release_at, lb.data ? released : true, refetch)

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-12">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">
          <ArrowLeft aria-hidden /> {t('rules.backToDashboard')}
        </Link>
      </Button>

      {lb.isPending ? (
        <Loading />
      ) : lb.isError ? (
        <ErrorState
          message={studentErrorCode(lb.error) ? t(`errors.${studentErrorCode(lb.error)}`) : errorMessage(lb.error)}
          onRetry={() => void lb.refetch()}
        />
      ) : !lb.data.released ? (
        <LockedBoard lb={lb.data} />
      ) : (
        <ReleasedBoard lb={lb.data} live={live} />
      )}
    </main>
  )
}

function LockedBoard({ lb }: { lb: Leaderboard }) {
  const { t } = useTranslation()
  const now = useServerNow(0) // syncs with the server on mount
  const releaseMs = lb.release_at ? new Date(lb.release_at).getTime() : null
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{t('leaderboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{lb.title}</p>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center" role="status">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">
          {lb.release_at ? t('result.publishedAt', { time: formatEAT(lb.release_at) }) : t('result.publishedLater')}
        </p>
        {releaseMs && releaseMs > now && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('result.publishedIn', { countdown: formatCountdown(releaseMs - now) })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('leaderboard.lockedHint')}</p>
      </div>
    </>
  )
}

function ReleasedBoard({ lb, live }: { lb: Extract<Leaderboard, { released: true }>; live: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('leaderboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{lb.title}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{t('leaderboard.participants', { count: lb.total })}</p>
          <p className="flex items-center justify-end gap-1.5" aria-live="polite">
            <span className={cn('size-2 rounded-full', live ? 'animate-pulse bg-success' : 'bg-muted-foreground/40')} aria-hidden />
            {live ? t('leaderboard.live') : t('leaderboard.notLive')}
          </p>
        </div>
      </div>

      {lb.me && (
        <div className="sticky top-2 z-10">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('leaderboard.yourPosition')}</p>
          <Row row={lb.me} pinned />
        </div>
      )}

      {lb.rows.length === 0 ? (
        <EmptyState title={t('leaderboard.empty')} />
      ) : (
        <ol aria-label={t('leaderboard.topN', { count: lb.rows.length })} className="space-y-1.5">
          {lb.rows.map((row, i) => (
            <li key={`${row.rank}-${i}`}>
              <Row row={row} />
            </li>
          ))}
        </ol>
      )}
      {lb.total > lb.rows.length && (
        <p className="text-center text-xs text-muted-foreground">
          {t('leaderboard.showingTop', { shown: lb.rows.length, total: lb.total })}
        </p>
      )}
    </>
  )
}

function Row({ row, pinned = false }: { row: LeaderboardRow; pinned?: boolean }) {
  const { t } = useTranslation()
  const medal = row.rank <= 3 ? ['text-yellow-500', 'text-slate-400', 'text-amber-700'][row.rank - 1] : null
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5',
        row.is_me && 'border-primary bg-primary/5',
        pinned && 'shadow-md',
      )}
      aria-current={row.is_me ? 'true' : undefined}
    >
      <span className="flex w-10 shrink-0 items-center justify-center font-bold tabular-nums">
        {medal ? <Medal className={cn('size-5', medal)} aria-label={`#${row.rank}`} /> : `#${row.rank}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {row.full_name ?? '—'}
          {row.is_me && <span className="ml-1 text-xs text-primary">({t('leaderboard.you')})</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.school}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">
          {row.score}/{row.max_score}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatDuration(row.time_taken_seconds * 1000)}</p>
      </div>
    </div>
  )
}
