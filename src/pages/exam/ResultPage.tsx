import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, Clock, Flag, Lock, MinusCircle, Trophy, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatCountdown, formatDuration, formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { studentErrorCode } from '@/features/exam-room/api'
import { GoSuspended } from '@/auth/GoSuspended'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { LETTERS } from '@/features/exam-room/types'
import { useMyResult, useRefetchAtRelease, type MyResult, type ResultQuestion } from '@/features/results/api'

type Filter = 'all' | 'wrong' | 'unanswered'
type Released = Extract<MyResult, { released: true }>
type JustSubmitted = { auto?: boolean; late?: boolean; justSubmitted?: boolean }

export default function ResultPage() {
  const { examId = '' } = useParams()
  const { t } = useTranslation()
  const result = useMyResult(examId)
  const state = (useLocation().state ?? {}) as JustSubmitted
  const { refetch: refetchResult } = result
  const refetch = useCallback(() => void refetchResult(), [refetchResult])
  useRefetchAtRelease(result.data?.release_at, result.data?.released ?? true, refetch)

  if (result.isPending) return <Loading fullScreen />
  if (result.isError) {
    const code = studentErrorCode(result.error)
    if (code === 'banned') return <GoSuspended />
    if (code === 'no_result') return <Navigate to={`/exam/${examId}`} replace />
    return (
      <ErrorState
        fullScreen
        message={code ? t(`errors.${code}`) : errorMessage(result.error)}
        onRetry={() => void result.refetch()}
      />
    )
  }

  const r = result.data
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 pb-12">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">
          <ArrowLeft aria-hidden /> {t('rules.backToDashboard')}
        </Link>
      </Button>

      {state.justSubmitted && (
        <Alert variant={state.auto ? 'warning' : 'default'}>
          <AlertDescription className="flex items-center gap-2">
            {state.auto ? <Clock className="size-4" aria-hidden /> : <CheckCircle2 className="size-4 text-success" aria-hidden />}
            {state.late ? t('done.lateBody') : state.auto ? t('done.autoBody') : t('done.body')}
          </AlertDescription>
        </Alert>
      )}

      {r.released ? <Released r={r} /> : <Locked r={r} />}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Before the exam closes: submission confirmation only — the server sent no score.
// ---------------------------------------------------------------------------
function Locked({ r }: { r: MyResult }) {
  const { t } = useTranslation()
  const now = useServerNow(0)
  const releaseMs = r.release_at ? new Date(r.release_at).getTime() : null

  return (
    <section aria-labelledby="result-h" className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <p className="text-sm text-muted-foreground">{r.subject}</p>
        <h1 id="result-h" className="text-xl font-extrabold text-primary">{r.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        {t('result.submittedAt', { time: formatEAT(r.submitted_at) })}
        {r.auto_submitted && <Badge variant="secondary">{t('dashboard.autoSubmitted')}</Badge>}
      </div>
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted p-6 text-center" role="status">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">
          {r.release_at ? t('result.publishedAt', { time: formatEAT(r.release_at) }) : t('result.publishedLater')}
        </p>
        {releaseMs && releaseMs > now && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('result.publishedIn', { countdown: formatCountdown(releaseMs - now) })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('result.lockedHint')}</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// After the exam closes: score, rank and full answer review.
// ---------------------------------------------------------------------------
function Released({ r }: { r: Released }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')

  const pct = r.max_score ? Math.round((r.score / r.max_score) * 100) : 0
  const correct = r.questions.filter((q) => q.is_correct).length

  const shown = useMemo(
    () =>
      r.questions.filter((q) =>
        filter === 'all' ? true : filter === 'unanswered' ? !q.selected_option : q.selected_option && !q.is_correct,
      ),
    [filter, r.questions],
  )

  return (
    <>
      <section aria-labelledby="result-h" className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <p className="text-sm text-muted-foreground">{r.subject}</p>
          <h1 id="result-h" className="text-xl font-extrabold text-primary">{r.title}</h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t('result.score')} value={`${r.score}/${r.max_score}`} />
          <Stat label={t('result.percentage')} value={`${pct}%`} />
          <Stat
            label={t('result.rank')}
            value={r.rank ? `#${r.rank}` : '—'}
            sub={r.total ? t('result.ofTotal', { count: r.total }) : undefined}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> {t('result.timeTaken', { time: formatDuration(r.time_taken_seconds * 1000) })}
          </span>
          {r.auto_submitted && <Badge variant="secondary">{t('dashboard.autoSubmitted')}</Badge>}
          {r.attempt_no > 1 && <Badge variant="outline">{t('result.retake')}</Badge>}
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link to={`/exam/${r.exam_id}/leaderboard`}>
            <Trophy aria-hidden /> {t('result.viewLeaderboard')}
          </Link>
        </Button>
      </section>

      <section aria-labelledby="review-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="review-h" className="text-lg font-semibold">{t('result.review')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('result.correctCount', { correct, total: r.questions.length })}
          </p>
        </div>
        <div role="group" aria-label={t('result.filterLabel')} className="flex gap-1">
          {(['all', 'wrong', 'unanswered'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`result.filter.${f}`)}
            </Button>
          ))}
        </div>
        <ol className="space-y-3">
          {shown.map((q) => (
            <ReviewItem key={q.id} q={q} />
          ))}
        </ol>
      </section>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub ? `${label} · ${sub}` : label}</p>
    </div>
  )
}

function ReviewItem({ q }: { q: ResultQuestion }) {
  const { t } = useTranslation()
  const status = !q.selected_option ? 'unanswered' : q.is_correct ? 'correct' : 'wrong'

  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {t('result.questionN', { number: q.position })}
          {q.flagged && <Flag className="ml-1 inline size-3.5 fill-warning text-warning" aria-label={t('room.flagged')} />}
        </p>
        {status === 'correct' ? (
          <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden />{t('result.correct')}</Badge>
        ) : status === 'wrong' ? (
          <Badge variant="destructive"><XCircle className="size-3" aria-hidden />{t('result.wrong')}</Badge>
        ) : (
          <Badge variant="outline"><MinusCircle className="size-3" aria-hidden />{t('result.unanswered')}</Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap">{q.body}</p>
      {q.image_url && <img src={q.image_url} alt="" className="max-h-56 rounded border object-contain" loading="lazy" />}
      <ul className="space-y-1.5">
        {q.options.map((opt, i) => {
          const letter = LETTERS[i] ?? 'A'
          const mine = q.selected_option === letter
          const isCorrect = q.correct_option === letter
          return (
            <li
              key={letter}
              className={cn(
                'flex items-start gap-2 rounded-lg border p-2 text-sm',
                isCorrect && 'border-success bg-success/10',
                mine && !isCorrect && 'border-destructive bg-destructive/10',
              )}
            >
              <span className="font-semibold">{letter}.</span>
              <span className="flex-1">{opt}</span>
              {mine && <span className="text-xs font-medium">{t('result.yourAnswer')}</span>}
              {isCorrect && <span className="text-xs font-medium text-success">{t('result.correctAnswer')}</span>}
            </li>
          )
        })}
      </ul>
    </li>
  )
}
