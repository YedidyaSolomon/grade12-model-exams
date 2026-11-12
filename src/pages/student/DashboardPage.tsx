import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileQuestion,
  Lock,
  Search,
  Star,
  Timer,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useProfile } from '@/auth/useProfile'
import { errorMessage } from '@/lib/errors'
import { eatHour, formatCountdown, formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useStudentDashboard } from '@/features/exam-room/api'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { ExamStateMessage, availability, type ExamAvailability } from '@/features/exam-room/components/ExamStateMessage'
import { ReexamRequestForm } from '@/features/exam-room/components/ReexamRequestForm'
import { MyReexamRequests } from '@/features/exam-room/components/MyReexamRequests'
import { SubjectIcon } from '@/components/SubjectIcon'
import { GoSuspended } from '@/auth/GoSuspended'
import type { DashboardExam } from '@/features/exam-room/types'

type Profile = NonNullable<ReturnType<typeof useProfile>['data']>

/**
 * Student dashboard: navy header (greeting, school, chips), live exams on top, then
 * "Your exams" (tabs + search) at full width. The re-exam request form opens beside the
 * list on laptops and as a full-screen sheet on phones. "Your re-exam requests" below.
 */
export default function DashboardPage() {
  const profile = useProfile()
  const dash = useStudentDashboard()

  if (dash.isPending) {
    return (
      <>
        <Hero profile={profile.data} />
        <Loading />
      </>
    )
  }
  if (dash.isError) {
    return (
      <>
        <Hero profile={profile.data} />
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <ErrorState message={errorMessage(dash.error)} onRetry={() => void dash.refetch()} />
        </div>
      </>
    )
  }
  if (dash.data.banned) return <GoSuspended />
  return <Dashboard exams={dash.data.exams} offset={dash.data.offset} profile={profile.data} isAdmin={profile.data?.role === 'admin'} />
}

function Dashboard({
  exams,
  offset,
  profile,
  isAdmin,
}: {
  exams: DashboardExam[]
  offset: number
  profile: Profile | undefined
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  // Server time (offset measured from the dashboard response): drives the greeting,
  // every countdown and which section an exam belongs to.
  const now = useServerNow(offset)
  const [requestFor, setRequestFor] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const closeForm = useCallback(() => setRequestFor(null), [])
  const onSent = useCallback(() => {
    setRequestFor(null)
    setSent(true)
  }, [])

  const withAv = exams.map((e) => ({ e, av: availability(e, now) }))
  const live = withAv.filter((x) => x.av.kind === 'resume' || x.av.kind === 'start')
  const rest = withAv.filter((x) => x.av.kind !== 'resume' && x.av.kind !== 'start')
  const requestable = exams.filter((e) => e.can_request_reexam)

  // Only RELEASED results count; before release the server sends no score at all.
  const released = exams.filter((e) => e.released && e.attempt?.submitted_at && e.attempt.max_score)
  const best = released.length
    ? Math.max(...released.map((e) => Math.round(((e.attempt!.score ?? 0) / e.attempt!.max_score!) * 100)))
    : null
  const chips = {
    live: live.length,
    completed: exams.filter((e) => e.attempt?.submitted_at).length,
    pending: exams.filter((e) => e.reexam_pending).length,
  }

  function openRequest(examId: string) {
    setSent(false)
    setRequestFor(examId)
  }

  return (
    <>
      <Hero profile={profile} nowMs={now} chips={chips} best={best} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 pt-5 pb-12 sm:pt-6">
        {requestable.length > 0 && (
          <div className="flex gap-3 rounded-xl border border-gold/50 bg-gold-soft/60 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div className="text-sm">
              <p className="font-bold text-gold-foreground">{t('dashboard.missedTitle')}</p>
              <p className="text-gold-foreground/90">{t('dashboard.missedBody')}</p>
            </div>
          </div>
        )}

        {live.length > 0 && (
          <section aria-labelledby="live-h" className="space-y-3">
            <h2 id="live-h" className="flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-live uppercase">
              <span aria-hidden className="size-2 rounded-full bg-live" />
              {t('dashboard.live')}
            </h2>
            {live.map(({ e, av }) => (
              <LiveCard key={e.id} exam={e} av={av} now={now} />
            ))}
          </section>
        )}

        <div className={cn('grid grid-cols-1 gap-6', requestFor && 'lg:grid-cols-[minmax(0,1fr)_22rem]')}>
          <div className="min-w-0 space-y-3">
            {sent && (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="flex-1">{t('reexamRequest.sent')}</span>
                <button type="button" onClick={() => setSent(false)} aria-label={t('reexamRequest.close')}>
                  <X className="size-4" aria-hidden />
                </button>
              </p>
            )}
            <YourExams
              items={rest}
              now={now}
              hasLive={live.length > 0}
              isAdmin={isAdmin}
              onRequest={openRequest}
              activeRequest={requestFor}
            />
          </div>
          {requestFor && (
            <ReexamRequestForm
              exams={requestable}
              examId={requestFor}
              onExamChange={setRequestFor}
              onClose={closeForm}
              onSent={onSent}
            />
          )}
        </div>

        <MyReexamRequests />
      </div>
    </>
  )
}

function greetingKey(nowMs: number): 'morning' | 'afternoon' | 'evening' {
  const h = eatHour(nowMs)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  return 'evening'
}

function Hero({
  profile,
  nowMs,
  chips,
  best,
}: {
  profile: Profile | undefined
  nowMs?: number
  chips?: { live: number; completed: number; pending: number }
  best?: number | null
}) {
  const { t } = useTranslation()
  const name = profile?.full_name?.split(' ')[0] ?? ''
  const details = [profile?.school, profile?.stream ? t(`profile.${profile.stream}`) : null].filter(Boolean).join(' · ')
  return (
    <div className="relative overflow-hidden bg-primary text-primary-foreground">
      {/* A plain gold circle, as in the design. Pure CSS, laptop only. */}
      <div aria-hidden className="pointer-events-none absolute top-6 right-[8%] hidden size-24 rounded-full bg-gold/90 md:block" />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* Greeting only once server time is known (never the device clock). */}
        <p className="min-h-4 text-[0.6875rem] font-bold tracking-[0.08em] text-white/75 uppercase">
          {nowMs !== undefined && t(`dashboard.greet.${greetingKey(nowMs)}`)}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-balance sm:text-3xl">
          {name ? t('dashboard.hello', { name }) : t('dashboard.helloNoName')}
        </h1>
        {details && <p className="mt-1 text-sm text-white/80">{details}</p>}
        {chips && (
          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold" aria-label={t('dashboard.statsLabel')}>
            <Chip dot="bg-live">{t('dashboard.chips.live', { count: chips.live })}</Chip>
            <Chip dot="bg-success">{t('dashboard.chips.completed', { count: chips.completed })}</Chip>
            <Chip dot="bg-gold">{t('dashboard.chips.pending', { count: chips.pending })}</Chip>
            {best !== null && best !== undefined && <Chip dot="bg-white">{t('dashboard.chips.best', { pct: best })}</Chip>}
          </ul>
        )}
      </div>
    </div>
  )
}

function Chip({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5">
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {children}
    </li>
  )
}

type Item = { e: DashboardExam; av: ExamAvailability }
type Tab = 'all' | 'missed' | 'scheduled'

/** "Your exams": tabs (All / Closed–missed / Scheduled) and search over everything not live. */
function YourExams({
  items,
  now,
  hasLive,
  isAdmin,
  onRequest,
  activeRequest,
}: {
  items: Item[]
  now: number
  hasLive: boolean
  isAdmin: boolean
  onRequest: (examId: string) => void
  activeRequest: string | null
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')

  const sorted = useMemo(() => {
    // Scheduled first (soonest on top), then everything else, newest first.
    const ms = (s: string | null) => (s ? new Date(s).getTime() : 0)
    const up = items.filter((x) => x.av.kind === 'upcoming').sort((a, b) => ms(a.e.next_starts_at) - ms(b.e.next_starts_at))
    const done = items.filter((x) => x.av.kind !== 'upcoming').sort((a, b) => ms(b.e.last_ends_at) - ms(a.e.last_ends_at))
    return [...up, ...done]
  }, [items])

  const byTab: Record<Tab, Item[]> = {
    all: sorted,
    missed: sorted.filter((x) => x.av.kind === 'closed'),
    scheduled: sorted.filter((x) => x.av.kind === 'upcoming'),
  }
  const q = query.trim().toLowerCase()
  const shown = byTab[tab].filter((x) => !q || `${x.e.title} ${x.e.subject}`.toLowerCase().includes(q))

  return (
    <section aria-labelledby="your-exams" className="rounded-xl border bg-card card-shadow">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="your-exams" className="text-lg font-extrabold text-primary">
            {t('dashboard.exams.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.exams.subtitle')}</p>
        </div>
        <div className="relative sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('dashboard.exams.search')}
            aria-label={t('dashboard.exams.search')}
            className="pl-9"
          />
        </div>
      </div>

      <div role="tablist" aria-label={t('dashboard.exams.title')} className="flex gap-1.5 overflow-x-auto px-4 pt-3">
        {(['all', 'missed', 'scheduled'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls="exams-panel"
            onClick={() => setTab(k)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors',
              tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-primary',
            )}
          >
            {t(`dashboard.exams.tabs.${k}`)} ({byTab[k].length})
          </button>
        ))}
      </div>

      <div id="exams-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3 p-4">
        {shown.length === 0 ? (
          q ? (
            <EmptyState title={t('dashboard.exams.noMatch', { q: query.trim() })} />
          ) : tab === 'all' && !hasLive && isAdmin ? (
            // Admin-only hint; students just see the plain empty state.
            <EmptyState
              title={t('dashboard.adminLiveEmpty')}
              action={
                <Button asChild size="sm" variant="press-outline">
                  <Link to="/admin/exams">{t('dashboard.adminGoToExams')}</Link>
                </Button>
              }
            />
          ) : tab === 'all' && !hasLive ? (
            <EmptyState title={t('dashboard.exams.emptyAll')} />
          ) : (
            <EmptyState title={t(`dashboard.exams.empty.${tab}`)} />
          )
        ) : (
          shown.map(({ e, av }) => (
            <ExamRow key={e.id} exam={e} av={av} now={now} onRequest={onRequest} active={activeRequest === e.id} />
          ))
        )}
      </div>
    </section>
  )
}

const TAG_TONE = {
  scheduled: 'bg-primary-soft text-primary',
  missed: 'bg-live-soft text-live',
  submitted: 'bg-success/15 text-success',
  results: 'bg-gold-soft text-gold-foreground',
} as const

function ExamRow({
  exam,
  av,
  now,
  onRequest,
  active,
}: {
  exam: DashboardExam
  av: ExamAvailability
  now: number
  onRequest: (examId: string) => void
  active: boolean
}) {
  const { t } = useTranslation()
  const a = exam.attempt
  const submitted = !!a?.submitted_at
  const tag: keyof typeof TAG_TONE | null =
    av.kind === 'upcoming' ? 'scheduled' : av.kind === 'closed' ? 'missed' : submitted ? (exam.released ? 'results' : 'submitted') : null

  return (
    <article className={cn('rounded-xl border p-4 transition-colors', active ? 'border-primary bg-primary-soft/40' : 'bg-card')}>
      <div className="flex gap-3">
        <SubjectIcon subject={exam.subject} className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] font-bold tracking-wide text-muted-foreground uppercase">{exam.subject}</span>
            {tag && (
              <span className={cn('rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold', TAG_TONE[tag])}>
                {t(`dashboard.tag.${tag}`)}
              </span>
            )}
            {exam.is_reexam && <Badge variant="secondary">{t('reexam.badge')}</Badge>}
          </div>
          <h3 className="leading-snug font-bold text-primary">{exam.title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden /> {t('dashboard.minutes', { count: exam.duration_minutes })}
            </span>
            <span className="inline-flex items-center gap-1">
              <FileQuestion className="size-3.5" aria-hidden /> {t('dashboard.questions', { count: exam.question_count })}
            </span>
          </p>
        </div>
        {submitted && exam.released && a?.max_score ? <ScoreRing pct={Math.round(((a.score ?? 0) / a.max_score) * 100)} /> : null}
      </div>

      <div className="mt-3 space-y-3 border-t pt-3">
        <RowStatus exam={exam} av={av} now={now} />
        <RowActions exam={exam} av={av} onRequest={onRequest} active={active} />
      </div>
    </article>
  )
}

function RowStatus({ exam, av, now }: { exam: DashboardExam; av: ExamAvailability; now: number }) {
  const { t } = useTranslation()
  const a = exam.attempt
  if (a?.submitted_at) {
    if (!exam.released) {
      // Before the exam closes the server sends no score or rank at all.
      return (
        <div className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {t('dashboard.submittedAt', { time: formatEAT(a.submitted_at) })}
            {a.auto_submitted && <Badge variant="secondary">{t('dashboard.autoSubmitted')}</Badge>}
          </p>
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            {exam.results_at ? t('dashboard.resultsAfter', { time: formatEAT(exam.results_at) }) : t('result.publishedLater')}
          </p>
        </div>
      )
    }
    return (
      <p className="flex flex-wrap gap-1.5 text-xs font-bold tabular-nums">
        <span className="rounded-md bg-muted px-2 py-0.5">
          {a.score ?? 0}/{a.max_score ?? 0}
        </span>
        {a.rank && (
          <span className="rounded-md bg-gold-soft px-2 py-0.5 text-gold-foreground">
            {t('dashboard.rank', { rank: a.rank, total: a.total ?? a.rank })}
          </span>
        )}
        {a.auto_submitted && <span className="rounded-md bg-secondary px-2 py-0.5">{t('dashboard.autoSubmitted')}</span>}
      </p>
    )
  }
  return (
    <>
      <ExamStateMessage exam={exam} av={av} nowMs={now} />
      {exam.reexam_request?.admin_note && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">{t('reexamRequest.adminNote')}:</span> {exam.reexam_request.admin_note}
        </p>
      )}
      {exam.reexam_request?.status === 'approved' && (
        <p className="text-xs text-muted-foreground">{t('reexamRequest.approvedHint')}</p>
      )}
    </>
  )
}

function RowActions({
  exam,
  av,
  onRequest,
  active,
}: {
  exam: DashboardExam
  av: ExamAvailability
  onRequest: (examId: string) => void
  active: boolean
}) {
  const { t } = useTranslation()
  if (exam.attempt?.submitted_at && exam.released) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild size="sm" variant="press-outline" className="h-10">
          <Link to={`/exam/${exam.id}/result`}>{t('dashboard.viewResult')}</Link>
        </Button>
        <Button asChild size="sm" variant="press-outline" className="h-10">
          <Link to={`/exam/${exam.id}/leaderboard`}>
            <Trophy aria-hidden /> {t('dashboard.leaderboard')}
          </Link>
        </Button>
      </div>
    )
  }
  if (av.kind === 'closed' && exam.can_request_reexam) {
    return (
      <div className="flex sm:justify-end">
        <Button size="sm" variant="press-outline" className="h-10 w-full sm:w-auto" onClick={() => onRequest(exam.id)} aria-pressed={active}>
          {t('reexamRequest.action')}
        </Button>
      </div>
    )
  }
  return null
}

/** Live exam: pills, title, fact tiles, go. */
function LiveCard({ exam, av, now }: { exam: DashboardExam; av: ExamAvailability; now: number }) {
  const { t } = useTranslation()
  const resume = av.kind === 'resume'
  const endsMs = resume && exam.attempt ? new Date(exam.attempt.deadline_at).getTime() : new Date(exam.live_ends_at ?? 0).getTime()
  const left = formatCountdown(endsMs - now)

  return (
    <div className="overflow-hidden rounded-xl border bg-card card-shadow">
      <div className="h-1 bg-live" aria-hidden />
      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1.5 text-[0.6875rem] font-bold tabular-nums">
            {resume ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-primary">
                <Clock className="size-3.5" aria-hidden /> {t('dashboard.yourTimeLeft', { time: left })}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-live-soft px-2 py-1 text-live uppercase">
                  <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                  {t('dashboard.liveNow')}
                </span>
                <span className="rounded-md bg-primary-soft px-2 py-1 text-primary">{t('dashboard.closesIn', { time: left })}</span>
              </>
            )}
            {exam.is_reexam && <Badge variant="secondary">{t('reexam.badge')}</Badge>}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <SubjectIcon subject={exam.subject} className="size-11 rounded-lg" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{exam.subject}</p>
              <h3 className="text-xl leading-snug font-extrabold text-primary">{exam.title}</h3>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <StatTile icon={FileQuestion} label={t('dashboard.factQuestions')} value={String(exam.question_count)} />
            <StatTile icon={Timer} label={t('dashboard.factMinutes')} value={String(exam.duration_minutes)} />
            <StatTile icon={Star} label={t('dashboard.factPoints')} value={String(exam.total_points)} />
          </dl>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-lg bg-background p-3 md:p-4">
          <p className="text-xs text-muted-foreground">
            <span className="mb-0.5 flex items-center gap-1.5 font-bold text-foreground">
              <Timer className="size-3.5" aria-hidden /> {t('dashboard.clockNoteTitle')}
            </span>
            {t('dashboard.clockNote')}
          </p>
          <Button asChild variant="press" size="lg" className="w-full">
            <Link to={resume ? `/exam/${exam.id}/room` : `/exam/${exam.id}`}>
              {resume ? t('dashboard.resume') : av.kind === 'start' && av.retake ? t('dashboard.startRetake') : t('dashboard.start')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-lg border bg-background px-3 py-2.5">
      <dd className="text-lg font-extrabold text-primary tabular-nums">{value}</dd>
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
    </div>
  )
}

/** Percentage ring: CSS conic gradient, no images or SVG. */
function ScoreRing({ pct }: { pct: number }) {
  const { t } = useTranslation()
  return (
    <div
      className="grid size-14 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--primary) 0 ${pct}%, var(--primary-soft) 0)` }}
      role="img"
      aria-label={t('dashboard.percentLabel', { pct })}
    >
      <span className="grid size-10 place-items-center rounded-full bg-card text-xs font-extrabold text-primary tabular-nums">
        {pct}%
      </span>
    </div>
  )
}
