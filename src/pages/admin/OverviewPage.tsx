import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Ban, Inbox, PenLine, Plus, Radio, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState, Loading } from '@/components/states'
import { useProfile } from '@/auth/useProfile'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAdminOverview } from '@/features/admin/api'
import { AuditList } from '@/features/admin/components/AuditList'

/** Admin home: navy welcome banner, colourful stat tiles, live exams, recent actions. */
export default function OverviewPage() {
  const { t } = useTranslation()
  const q = useAdminOverview()
  const profile = useProfile()
  const firstName = profile.data?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Banner name={firstName} pending={q.data?.pending_requests ?? 0} />

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <h2 className="sr-only">{t('admin.overview')}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
            <Stat to="/admin/students" icon={Users} tone="bg-primary-soft text-primary" label={t('overview.students')}
              value={q.data.total_students}
              sub={q.data.incomplete ? t('overview.incomplete', { count: q.data.incomplete }) : undefined} />
            <Stat to="/admin/students?status=banned" icon={Ban} tone="bg-rose-100 text-rose-700" label={t('overview.banned')}
              value={q.data.banned} />
            <Stat to="/admin/exams" icon={Radio} tone="bg-live-soft text-live" label={t('overview.liveExams')}
              value={q.data.live_exams} />
            <Stat icon={PenLine} tone="bg-emerald-100 text-emerald-700" label={t('overview.writingNow')}
              value={q.data.writing_now} />
            <Stat to="/admin/requests" icon={Inbox} tone="bg-gold-soft text-gold-foreground" label={t('overview.pendingRequests')}
              value={q.data.pending_requests} highlight={q.data.pending_requests > 0} />
          </div>

          <Panel title={t('overview.liveNow')} count={q.data.live.length}>
            {q.data.live.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-7 text-center">
                <IdleIllustration />
                <p className="text-sm font-semibold text-muted-foreground">{t('overview.noLive')}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {q.data.live.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/admin/exams/${e.id}/manage`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border-2 border-border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
                    >
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-live-soft px-2.5 py-0.5 text-xs font-extrabold text-live">
                        <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />
                        {t('exams.status.live')}
                      </span>
                      <span className="font-extrabold">{e.title}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 tabular-nums">
                        {t('overview.writing', { count: e.writing })}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
                        {t('overview.submitted', { count: e.submitted })}
                      </span>
                      <span className="ml-auto text-xs font-semibold text-muted-foreground">
                        {t('overview.closes', { time: formatEAT(e.live_ends_at) })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('overview.recentActions')}>
            <AuditList entries={q.data.recent_actions} />
          </Panel>
        </>
      )}
    </div>
  )
}

/** Indigo welcome banner with quick actions and a small inline illustration. */
function Banner({ name, pending }: { name: string; pending: number }) {
  const { t } = useTranslation()
  return (
    <section className="relative overflow-hidden rounded-xl bg-primary text-primary-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(255 255 255 / 0.08) 0 40%, rgb(255 255 255 / 0.04) 40.5% 70%, transparent 70.5%)' }}
      />
      <div className="relative flex items-center gap-6 p-5 sm:p-7">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
              {name ? t('overview.welcome', { name }) : t('overview.welcomeNoName')}
            </h1>
            <p className="mt-1 text-sm font-semibold text-white/80 sm:text-base">{t('overview.tagline')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-11 bg-white px-4 font-bold text-primary hover:bg-white/90">
              <Link to="/admin/exams/new">
                <Plus aria-hidden /> {t('exams.actions.create')}
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-lg bg-white/12 px-4 font-extrabold text-white hover:bg-white/20 hover:text-white">
              <Link to="/admin/requests">
                <Inbox aria-hidden /> {t('admin.requests')}
                {pending > 0 && (
                  <span className="rounded-full bg-gold px-1.5 text-xs text-gold-foreground tabular-nums">{pending}</span>
                )}
              </Link>
            </Button>
          </div>
        </div>
        <ExamIllustration />
      </div>
    </section>
  )
}

/** Exam paper with ticks, a pencil and a sun. Inline SVG: no download. */
function ExamIllustration() {
  return (
    <svg viewBox="0 0 200 160" className="hidden w-48 shrink-0 sm:block lg:w-56" aria-hidden>
      <circle cx="160" cy="34" r="22" className="fill-gold" />
      <circle cx="160" cy="34" r="32" className="fill-white/10" />
      <g transform="rotate(-6 90 90)">
        <rect x="40" y="28" width="104" height="124" rx="12" className="fill-black/15" transform="translate(4 6)" />
        <rect x="40" y="28" width="104" height="124" rx="12" className="fill-white" />
        <rect x="54" y="42" width="52" height="8" rx="4" className="fill-primary" />
        <rect x="54" y="55" width="34" height="5" rx="2.5" className="fill-primary-soft" />
        {[74, 98, 122].map((y, i) => (
          <g key={y}>
            <circle cx="62" cy={y} r="8" className={i === 2 ? 'fill-primary-soft' : 'fill-emerald-500'} />
            {i < 2 && (
              <path d={`M58 ${y} l3 3 l5 -6`} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <rect x="76" y={y - 5} width={i === 1 ? 44 : 54} height="5" rx="2.5" className="fill-primary-soft" />
            <rect x="76" y={y + 3} width={i === 1 ? 30 : 38} height="4" rx="2" className="fill-muted" />
          </g>
        ))}
      </g>
      <g transform="rotate(38 150 112)">
        <rect x="138" y="70" width="16" height="70" rx="3" className="fill-gold" />
        <rect x="138" y="70" width="16" height="10" rx="3" className="fill-rose-300" />
        <rect x="138" y="80" width="16" height="4" className="fill-white/70" />
        <path d="M138 140 h16 l-8 16 z" className="fill-amber-100" />
        <path d="M143.5 151 h5 l-2.5 5 z" className="fill-foreground" />
      </g>
    </svg>
  )
}

/** Calm "nothing live" picture: a clock beside a closed paper. */
function IdleIllustration() {
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-auto" aria-hidden>
      <rect x="10" y="10" width="44" height="50" rx="8" className="fill-primary-soft" />
      <rect x="18" y="20" width="24" height="5" rx="2.5" className="fill-primary/40" />
      <rect x="18" y="31" width="28" height="4" rx="2" className="fill-primary/20" />
      <rect x="18" y="40" width="20" height="4" rx="2" className="fill-primary/20" />
      <circle cx="84" cy="34" r="24" className="fill-gold/45" />
      <circle cx="84" cy="34" r="17" className="fill-white" />
      <path d="M84 24 v10 l7 5" fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 card-shadow">
      <h2 className="flex items-center gap-2 text-base font-extrabold">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary tabular-nums">{count}</span>
        )}
      </h2>
      {children}
    </section>
  )
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  to,
  highlight,
}: {
  icon: typeof Users
  tone: string
  label: string
  value: number
  sub?: string
  to?: string
  highlight?: boolean
}) {
  const body = (
    <>
      <span aria-hidden className={cn('grid size-10 place-items-center rounded-lg', tone)}>
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <p className="mt-3 text-3xl leading-none font-extrabold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-bold text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-warning">{sub}</p>}
    </>
  )
  const cls = cn(
    'block rounded-xl border-2 bg-card p-4 card-shadow',
    highlight ? 'border-gold bg-gold-soft/50' : 'border-border',
  )
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-primary/40 hover:bg-primary-soft/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
