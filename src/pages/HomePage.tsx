import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  ArrowRight,
  CalendarClock,
  FileQuestion,
  LogIn,
  Medal,
  Send,
  Smartphone,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Brand } from '@/components/Brand'
import { SubjectIcon } from '@/components/SubjectIcon'
import { useTelegramSignIn } from '@/auth/useTelegramSignIn'
import { usePublicHome, type PublicHome, type PublicExamStream } from '@/features/public/api'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { env } from '@/lib/env'
import { formatCountdown, formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'

/**
 * Public landing page at "/" for logged-out visitors (signed-in users get the dashboard).
 * Shows only real data from public_home(): counts, the live / next exam, and a podium of
 * short names for the latest RELEASED exam. Students are minors: no full names, schools,
 * regions or Telegram usernames. The full leaderboard needs sign-in.
 */
export default function HomePage() {
  const { t } = useTranslation()
  const tg = useTelegramSignIn()
  const home = usePublicHome()
  const data = home.data

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16">
          <Brand />
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <a href="#how" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-primary md:block">
              {t('home.nav.how')}
            </a>
            {data?.podium && (
              <a href="#results" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-primary md:block">
                {t('home.nav.results')}
              </a>
            )}
            <Button variant="telegram" size="sm" className="h-9 px-3" onClick={tg.signIn} disabled={tg.pending}>
              <Send aria-hidden /> {t('home.signInShort')}
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero. Phone order: intro, sign-in card, features. Laptop: card on the right. */}
        <section className="border-b bg-card">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-7 sm:py-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-x-12 lg:py-14">
            <div>
              <Pill>{t('home.pill')}</Pill>
              <h1 className="mt-3 text-[1.875rem] leading-[1.15] font-extrabold text-primary text-balance sm:text-4xl lg:text-[2.75rem]">
                {t('home.title')}
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground">{t('home.lead')}</p>
            </div>

            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              <SignInCard tg={tg} data={data} />
            </div>

            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Feature icon={Timer} title={t('home.features.timed.title')} body={t('home.features.timed.body')} />
              <Feature icon={Send} title={t('home.features.telegram.title')} body={t('home.features.telegram.body')} />
              <Feature icon={Trophy} title={t('home.features.results.title')} body={t('home.features.results.body')} />
              <Feature icon={Smartphone} title={t('home.features.phone.title')} body={t('home.features.phone.body')} />
            </ul>
          </div>
        </section>

        {data && (data.live.length > 0 || data.next) && <WhatsOn data={data} onSignIn={tg.signIn} />}
        {data?.podium && data.podium.rows.length > 0 && <Podium podium={data.podium} onSignIn={tg.signIn} />}
        <HowItWorks />

        {/* Closing call to action on the navy band. */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold">{t('home.cta.title')}</h2>
              <p className="mt-1 text-white/80">{t('home.cta.body')}</p>
            </div>
            <Button size="lg" className="w-full bg-white text-primary hover:bg-white/90 sm:w-auto" onClick={tg.signIn} disabled={tg.pending}>
              <Send aria-hidden /> {tg.pending ? t('login.redirecting') : t('login.telegram')}
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <p>{t('app.tagline')}</p>
        </div>
      </footer>
    </div>
  )
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide text-primary uppercase',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

function Feature({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-lg border bg-background p-3">
      <Icon className="mt-0.5 size-[1.125rem] shrink-0 text-primary" aria-hidden />
      <div>
        <p className="text-sm font-bold text-primary">{title}</p>
        <p className="text-[0.8125rem] text-muted-foreground">{body}</p>
      </div>
    </li>
  )
}

function SignInCard({
  tg,
  data,
}: {
  tg: ReturnType<typeof useTelegramSignIn>
  data: PublicHome | undefined
}) {
  const { t, i18n } = useTranslation()
  const nf = new Intl.NumberFormat(i18n.language)
  return (
    <div className="overflow-hidden rounded-xl border bg-card card-shadow">
      <div className="h-1 bg-primary" aria-hidden />
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-extrabold text-primary">{t('home.signIn.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('home.signIn.body')}</p>
        </div>
        <Button variant="telegram" size="lg" className="w-full" onClick={tg.signIn} disabled={tg.pending}>
          <Send aria-hidden />
          {tg.pending ? t('login.redirecting') : t('login.telegram')}
        </Button>
        {tg.error && (
          <Alert variant="destructive">
            <AlertDescription>{t('login.failed', { message: tg.error })}</AlertDescription>
          </Alert>
        )}
        {/* Real counts only; hidden until there is something to show. */}
        {data && data.students > 0 && (
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="flex flex-col-reverse rounded-lg border bg-background px-2 py-3">
              <dt className="text-[0.6875rem] font-semibold text-muted-foreground uppercase">{t('home.stats.students')}</dt>
              <dd className="text-xl font-extrabold text-primary tabular-nums">{nf.format(data.students)}</dd>
            </div>
            <div className="flex flex-col-reverse rounded-lg border bg-background px-2 py-3">
              <dt className="text-[0.6875rem] font-semibold text-muted-foreground uppercase">{t('home.stats.examsHeld')}</dt>
              <dd className="text-xl font-extrabold text-primary tabular-nums">{nf.format(data.exams_held)}</dd>
            </div>
          </dl>
        )}
        {/* Never in production: env.devLoginEnabled is false in production builds. */}
        {import.meta.env.DEV && env.devLoginEnabled && (
          <p className="text-center">
            <Link to="/login" className="inline-flex items-center gap-1 text-xs font-semibold text-warning hover:underline">
              <LogIn className="size-3.5" aria-hidden /> {t('login.devTitle')}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

function useStreamLabel() {
  const { t } = useTranslation()
  return (s: PublicExamStream) => (s === 'both' ? t('home.streamBoth') : t(`profile.${s}`))
}

/** The exam open right now (design's "current exam" card), and the next one. */
function WhatsOn({ data, onSignIn }: { data: PublicHome & { offset: number }; onSignIn: () => void }) {
  const { t } = useTranslation()
  const now = useServerNow(data.offset)
  const streamLabel = useStreamLabel()

  return (
    <section id="exams" className="mx-auto max-w-6xl scroll-mt-20 space-y-3 px-4 pt-8 sm:pt-12">
      <h2
        className={cn(
          'flex items-center gap-2 text-xs font-bold tracking-[0.08em] uppercase',
          data.live.length ? 'text-live' : 'text-muted-foreground',
        )}
      >
        <span aria-hidden className={cn('size-2 rounded-full', data.live.length ? 'bg-live' : 'bg-primary')} />
        {data.live.length ? t('home.live.heading') : t('home.next.heading')}
      </h2>

      {data.live.map((e) => (
        <div key={`${e.title}-${e.ends_at}`} className="overflow-hidden rounded-xl border bg-card card-shadow">
          <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap gap-1.5 text-[0.6875rem] font-bold tabular-nums">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-live-soft px-2 py-1 text-live uppercase">
                  <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                  {t('dashboard.liveNow')}
                </span>
                <span className="rounded-md bg-primary-soft px-2 py-1 text-primary">
                  {t('dashboard.closesIn', { time: formatCountdown(new Date(e.ends_at).getTime() - now) })}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{streamLabel(e.stream)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <SubjectIcon subject={e.subject} className="size-11 rounded-lg" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">{e.subject}</p>
                  <h3 className="text-xl leading-snug font-extrabold text-primary">{e.title}</h3>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <Fact icon={FileQuestion} label={t('dashboard.factQuestions')} value={e.question_count} />
                <Fact icon={Timer} label={t('dashboard.factMinutes')} value={e.duration_minutes} />
              </dl>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-lg bg-background p-3 md:p-4">
              <p className="text-xs text-muted-foreground">
                <span className="mb-0.5 flex items-center gap-1.5 font-bold text-foreground">
                  <Timer className="size-3.5" aria-hidden /> {t('dashboard.clockNoteTitle')}
                </span>
                {t('dashboard.clockNote')}
              </p>
              <Button variant="press" size="lg" className="w-full" onClick={onSignIn}>
                {t('home.live.cta')} <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {data.next && (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 card-shadow">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <CalendarClock className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-primary">{t('home.next.title', { title: data.next.title })}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {t('home.next.meta', {
                subject: data.next.subject,
                stream: streamLabel(data.next.stream),
                time: formatEAT(data.next.starts_at),
                minutes: data.next.duration_minutes,
                count: data.next.question_count,
              })}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
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

const MEDAL = {
  1: { ring: 'bg-gold text-gold-foreground', card: 'border-gold/60', tag: 'bg-gold-soft text-gold-foreground' },
  2: { ring: 'bg-slate-300 text-slate-800', card: '', tag: 'bg-slate-100 text-slate-700' },
  3: { ring: 'bg-orange-300 text-orange-950', card: '', tag: 'bg-orange-50 text-orange-900' },
} as const

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Top 3 of the latest released exam. Phone: a ranked list (1, 2, 3). Laptop: a podium
 * with first place raised in the middle.
 */
function Podium({ podium, onSignIn }: { podium: NonNullable<PublicHome['podium']>; onSignIn: () => void }) {
  const { t } = useTranslation()
  const rows = podium.rows
  // Laptop order 2-1-3; phone keeps rank order.
  const desktopOrder = (i: number) => (rows.length === 3 ? ['md:order-2', 'md:order-1', 'md:order-3'][i] : '')

  return (
    <section id="results" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-10 sm:pt-14">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide text-gold-foreground uppercase">
        <Trophy className="size-3.5" aria-hidden /> {t('home.podium.pill')}
      </span>
      <h2 className="mt-3 text-2xl font-extrabold text-primary sm:text-3xl">{t('home.podium.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('home.podium.exam')} <b className="font-bold text-foreground">{podium.title}</b> ({podium.subject})
      </p>

      <ol
        className={cn(
          'mt-5 grid gap-2.5 md:mt-8 md:items-end md:gap-4',
          rows.length >= 3 && 'md:grid-cols-3',
          rows.length === 2 && 'md:grid-cols-[repeat(2,minmax(0,20rem))] md:justify-center',
          rows.length === 1 && 'md:grid-cols-[minmax(0,22rem)] md:justify-center',
        )}
      >
        {rows.map((r, i) => {
          const m = MEDAL[Math.min(r.rank, 3) as 1 | 2 | 3]
          const first = r.rank === 1
          return (
            <li
              key={i}
              className={cn(
                'flex items-center gap-3 rounded-xl border bg-card p-3 card-shadow md:flex-col md:items-stretch md:gap-4 md:p-5',
                m.card,
                desktopOrder(i),
                first && 'md:pb-8',
              )}
            >
              <div className="flex items-center gap-3 md:justify-between">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold', m.ring)}>
                  {r.rank}
                </span>
                {first && (
                  <span className="hidden items-center gap-1 rounded-md bg-gold-soft px-2 py-0.5 text-[0.6875rem] font-bold text-gold-foreground md:inline-flex">
                    <Medal className="size-3.5" aria-hidden /> {t('home.podium.first')}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary',
                    first && 'md:size-12 md:bg-primary md:text-primary-foreground',
                  )}
                >
                  {initials(r.name)}
                </span>
                <p className="min-w-0 truncate font-bold text-primary capitalize md:text-lg">{r.name ?? t('home.podium.student')}</p>
              </div>
              <div className="shrink-0 text-right md:rounded-lg md:bg-background md:px-3 md:py-2 md:text-left">
                <p className="hidden text-[0.6875rem] font-semibold text-muted-foreground md:block">{t('home.podium.score')}</p>
                <p className="font-extrabold text-primary tabular-nums md:text-xl">
                  {r.score}
                  <span className="text-sm font-semibold text-muted-foreground"> / {r.max_score}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t('home.podium.privacy')}</p>
        <button type="button" onClick={onSignIn} className="inline-flex items-center gap-1 self-start font-bold text-primary hover:underline">
          {t('home.podium.full')} <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  )
}

function HowItWorks() {
  const { t } = useTranslation()
  const steps = ['signIn', 'wait', 'take', 'results'] as const
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:py-14">
      <p className="text-xs font-bold tracking-[0.08em] text-telegram uppercase md:text-center">{t('home.how.pill')}</p>
      <h2 className="mt-1 text-2xl font-extrabold text-primary sm:text-3xl md:text-center">{t('home.how.title')}</h2>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((k, i) => (
          <li key={k} className="flex gap-3 rounded-xl border bg-card p-4 card-shadow sm:flex-col sm:gap-3">
            <span
              aria-hidden
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white',
                i === 3 ? 'bg-gold text-gold-foreground' : i === 1 ? 'bg-telegram' : 'bg-primary',
              )}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="font-bold text-primary">{t(`home.how.${k}.title`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`home.how.${k}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
