import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { CalendarClock, CheckCircle2, Clock, Lock, Radio, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useProfile } from '@/auth/useProfile'
import { errorMessage } from '@/lib/errors'
import { formatCountdown, formatEAT } from '@/lib/time'
import { useStudentDashboard } from '@/features/exam-room/api'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { ExamStateMessage, availability, type ExamAvailability } from '@/features/exam-room/components/ExamStateMessage'
import type { DashboardExam } from '@/features/exam-room/types'

export default function DashboardPage() {
  const { t } = useTranslation()
  const profile = useProfile()
  const dash = useStudentDashboard()
  const firstName = profile.data?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('dashboard.greeting', { name: firstName })}</h1>
      {dash.isPending ? (
        <Loading />
      ) : dash.isError ? (
        <ErrorState message={errorMessage(dash.error)} onRetry={() => void dash.refetch()} />
      ) : dash.data.banned ? (
        <Navigate to="/suspended" replace />
      ) : (
        <Sections exams={dash.data.exams} offset={dash.data.offset} isAdmin={profile.data?.role === 'admin'} />
      )}
    </div>
  )
}

function Sections({ exams, offset, isAdmin }: { exams: DashboardExam[]; offset: number; isAdmin: boolean }) {
  const { t } = useTranslation()
  const now = useServerNow(offset)

  const withAv = exams.map((e) => ({ e, av: availability(e, now) }))
  const live = withAv.filter((x) => x.av.kind === 'resume' || x.av.kind === 'start')
  const upcoming = withAv.filter((x) => x.av.kind === 'upcoming')
  const completed = withAv.filter((x) => x.av.kind === 'taken' || x.av.kind === 'closed')

  return (
    <>
      <Section icon={<Radio className="size-4 text-destructive" aria-hidden />} title={t('dashboard.live')}>
        {live.length === 0 ? (
          isAdmin ? (
            // Admin-only hint; students just see the plain empty state.
            <EmptyState
              title={t('dashboard.adminLiveEmpty')}
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/exams">{t('dashboard.adminGoToExams')}</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState title={t('dashboard.liveEmpty')} />
          )
        ) : (
          live.map(({ e, av }) => <LiveCard key={e.id} exam={e} av={av} now={now} />)
        )}
      </Section>

      <Section icon={<CalendarClock className="size-4" aria-hidden />} title={t('dashboard.upcoming')}>
        {upcoming.length === 0 ? (
          <EmptyState title={t('dashboard.upcomingEmpty')} />
        ) : (
          upcoming.map(({ e, av }) => (
            <ExamCard key={e.id} exam={e}>
              <ExamStateMessage exam={e} av={av} nowMs={now} />
            </ExamCard>
          ))
        )}
      </Section>

      <Section icon={<CheckCircle2 className="size-4 text-success" aria-hidden />} title={t('dashboard.completed')}>
        {completed.length === 0 ? (
          <EmptyState title={t('dashboard.completedEmpty')} />
        ) : (
          completed.map(({ e, av }) => (
            <ExamCard key={e.id} exam={e}>
              {e.attempt?.submitted_at ? <ScoreLine exam={e} /> : <ExamStateMessage exam={e} av={av} nowMs={now} />}
            </ExamCard>
          ))
        )}
      </Section>
    </>
  )
}

function LiveCard({ exam, av, now }: { exam: DashboardExam; av: ExamAvailability; now: number }) {
  const { t } = useTranslation()
  const resume = av.kind === 'resume'
  const endsMs = resume && exam.attempt ? new Date(exam.attempt.deadline_at).getTime() : new Date(exam.live_ends_at ?? 0).getTime()

  return (
    <div className="space-y-3 rounded-xl border-2 border-destructive/30 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{exam.subject}</p>
          <h3 className="font-semibold">{exam.title}</h3>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.meta', { count: exam.question_count, minutes: exam.duration_minutes })}
          </p>
        </div>
        <Badge variant="live">{t('exams.status.live')}</Badge>
      </div>
      <p className="flex items-center gap-1.5 text-sm">
        <Clock className="size-4" aria-hidden />
        {resume
          ? t('dashboard.yourTimeLeft', { time: formatCountdown(endsMs - now) })
          : t('dashboard.closesIn', { time: formatCountdown(endsMs - now) })}
      </p>
      <Button asChild size="lg" className="w-full">
        <Link to={resume ? `/exam/${exam.id}/room` : `/exam/${exam.id}`}>
          {resume ? t('dashboard.resume') : av.kind === 'start' && av.retake ? t('dashboard.startRetake') : t('dashboard.start')}
        </Link>
      </Button>
    </div>
  )
}

function ExamCard({ exam, children }: { exam: DashboardExam; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div>
        <p className="text-xs text-muted-foreground">{exam.subject}</p>
        <h3 className="font-semibold">{exam.title}</h3>
      </div>
      {children}
    </div>
  )
}

function ScoreLine({ exam }: { exam: DashboardExam }) {
  const { t } = useTranslation()
  const a = exam.attempt
  if (!a?.submitted_at) return null

  // Before the exam closes the server sends no score or rank at all.
  if (!exam.released) {
    return (
      <div className="space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          {t('dashboard.submittedAt', { time: formatEAT(a.submitted_at) })}
          {a.auto_submitted && <Badge variant="secondary">{t('dashboard.autoSubmitted')}</Badge>}
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          {exam.results_at ? t('dashboard.resultsAfter', { time: formatEAT(exam.results_at) }) : t('result.publishedLater')}
        </p>
      </div>
    )
  }

  const pct = a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : 0
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-lg font-semibold tabular-nums">
          {a.score ?? 0}/{a.max_score ?? 0}
        </span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
        {a.rank && (
          <span className="font-medium tabular-nums">
            {t('dashboard.rank', { rank: a.rank, total: a.total ?? a.rank })}
          </span>
        )}
        {a.auto_submitted && <Badge variant="secondary">{t('dashboard.autoSubmitted')}</Badge>}
        <span className="w-full text-xs text-muted-foreground">
          {t('dashboard.submittedAt', { time: formatEAT(a.submitted_at) })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to={`/exam/${exam.id}/result`}>{t('dashboard.viewResult')}</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to={`/exam/${exam.id}/leaderboard`}>
            <Trophy aria-hidden /> {t('dashboard.leaderboard')}
          </Link>
        </Button>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
