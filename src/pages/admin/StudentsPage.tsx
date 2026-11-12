import { useDeferredValue, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { STUDENTS_PAGE_SIZE, useStudents } from '@/features/admin/api'
import type { Stream, StudentRow, StudentStatus } from '@/features/admin/types'

const STATUSES: StudentStatus[] = ['active', 'banned', 'incomplete']

const PILL = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap'
const CARD =
  'rounded-xl border border-border bg-card card-shadow'

/** Status pill: active = green, banned = red, incomplete = gold. */
export function StudentStatusBadge({ s }: { s: Pick<StudentRow, 'is_banned' | 'is_complete'> }) {
  const { t } = useTranslation()
  if (s.is_banned) return <span className={cn(PILL, 'bg-live-soft text-live')}>{t('students.status.banned')}</span>
  if (!s.is_complete)
    return <span className={cn(PILL, 'bg-gold-soft text-gold-foreground')}>{t('students.status.incomplete')}</span>
  return <span className={cn(PILL, 'bg-emerald-100 text-emerald-800')}>{t('students.status.active')}</span>
}

function StreamPill({ stream }: { stream: Stream | null }) {
  const { t } = useTranslation()
  if (!stream) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn(PILL, stream === 'natural' ? 'bg-teal-100 text-teal-800' : 'bg-violet-100 text-violet-800')}>
      {t(`exams.stream.${stream}`)}
    </span>
  )
}

const AVATAR_TONES = [
  'bg-primary-soft text-primary',
  'bg-gold-soft text-gold-foreground',
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
]

/** Initials on a colour picked from the id, so a student keeps the same colour. Decorative. */
function Avatar({ id, name }: { id: string; name: string | null }) {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-lg text-sm font-extrabold',
        AVATAR_TONES[h % AVATAR_TONES.length],
      )}
    >
      {initials || '?'}
    </span>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center rounded-full border-2 px-3.5 text-sm font-extrabold whitespace-nowrap transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft',
      )}
    >
      {children}
    </button>
  )
}

export default function StudentsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const stream = (params.get('stream') ?? '') as Stream | ''
  const status = (params.get('status') ?? '') as StudentStatus | ''
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const deferredSearch = useDeferredValue(search)

  const q = useStudents({ search: deferredSearch, stream, status, page })

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE))

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
          {t('students.title')}
          {q.data && (
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-sm font-extrabold text-primary tabular-nums">
              {t('students.count', { count: total })}
            </span>
          )}
        </h1>
        <div className="relative w-full sm:w-80">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setParam('q', e.target.value)
            }}
            placeholder={t('students.searchPlaceholder')}
            aria-label={t('students.searchPlaceholder')}
            className="h-10 rounded-full border-2 bg-card pl-10"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t('students.filterStatus')} className="flex flex-wrap gap-1.5">
          <Chip active={status === ''} onClick={() => setParam('status', '')}>
            {t('students.allStatuses')}
          </Chip>
          {STATUSES.map((st) => (
            <Chip key={st} active={status === st} onClick={() => setParam('status', st)}>
              {t(`students.status.${st}`)}
            </Chip>
          ))}
        </div>
        <span aria-hidden className="hidden h-6 w-0.5 rounded-full bg-border sm:block" />
        <div role="group" aria-label={t('students.filterStream')} className="flex flex-wrap gap-1.5">
          <Chip active={stream === ''} onClick={() => setParam('stream', '')}>
            {t('students.allStreams')}
          </Chip>
          <Chip active={stream === 'natural'} onClick={() => setParam('stream', 'natural')}>
            {t('exams.stream.natural')}
          </Chip>
          <Chip active={stream === 'social'} onClick={() => setParam('stream', 'social')}>
            {t('exams.stream.social')}
          </Chip>
        </div>
      </div>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.rows.length === 0 ? (
        <EmptyState title={t('students.empty')} />
      ) : (
        <>
          <div className={cn(CARD, 'hidden overflow-x-auto md:block')}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/60 text-left text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">{t('students.cols.name')}</th>
                  <th scope="col" className="px-4 py-3">{t('students.cols.school')}</th>
                  <th scope="col" className="px-4 py-3">{t('students.cols.stream')}</th>
                  <th scope="col" className="px-4 py-3">{t('students.cols.status')}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t('students.cols.exams')}</th>
                  <th scope="col" className="px-4 py-3">{t('students.cols.joined')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-primary-soft/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar id={s.id} name={s.full_name} />
                        <div className="min-w-0">
                          <Link to={`/admin/students/${s.id}`} className="font-extrabold hover:text-primary hover:underline">
                            {s.full_name ?? t('students.noName')}
                          </Link>
                          <p className="truncate text-xs font-semibold text-muted-foreground">
                            {s.email ?? (s.telegram_username ? `@${s.telegram_username}` : '')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{s.school ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StreamPill stream={s.stream} />
                    </td>
                    <td className="px-4 py-3">
                      <StudentStatusBadge s={s} />
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold tabular-nums">{s.attempt_count}</td>
                    <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap text-muted-foreground">
                      {formatEAT(s.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per student instead of a sideways-scrolling table. */}
          <ul className="space-y-3 md:hidden">
            {q.data.rows.map((s) => (
              <li key={s.id}>
                <Link to={`/admin/students/${s.id}`} className={cn(CARD, 'block space-y-3 p-4 active:bg-primary-soft/50')}>
                  <div className="flex items-start gap-3">
                    <Avatar id={s.id} name={s.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug font-extrabold">{s.full_name ?? t('students.noName')}</p>
                      <p className="truncate text-xs font-semibold text-muted-foreground">
                        {s.email ?? (s.telegram_username ? `@${s.telegram_username}` : '')}
                      </p>
                    </div>
                    <StudentStatusBadge s={s} />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold">
                    <StreamPill stream={s.stream} />
                    {s.school && <span className="truncate">{s.school}</span>}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                    <div>
                      <dt className="font-bold text-muted-foreground uppercase">{t('students.cols.exams')}</dt>
                      <dd className="text-sm font-extrabold tabular-nums">{s.attempt_count}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-muted-foreground uppercase">{t('students.cols.joined')}</dt>
                      <dd className="font-semibold">{formatEAT(s.created_at)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="flex items-center justify-center gap-2 text-sm sm:justify-end" aria-label={t('students.pagination')}>
              <Button size="sm" variant="press-outline" className="h-10" disabled={page === 0} onClick={() => setParam('page', String(page - 1))}>
                <ChevronLeft aria-hidden /> {t('students.prev')}
              </Button>
              <span className="mb-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary tabular-nums">
                {t('students.page', { page: page + 1, pages })}
              </span>
              <Button size="sm" variant="press-outline" className="h-10" disabled={page + 1 >= pages} onClick={() => setParam('page', String(page + 1))}>
                {t('students.next')} <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
