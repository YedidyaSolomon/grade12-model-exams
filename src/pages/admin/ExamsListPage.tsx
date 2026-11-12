import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { BarChart3, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { SubjectIcon } from '@/components/SubjectIcon'
import { useAdminExams, useDeleteExam } from '@/features/exams/api'
import { StatusBadge } from '@/features/exams/components/StatusBadge'
import type { ExamState } from '@/features/exams/types'

const FILTERS = ['all', 'draft', 'scheduled', 'live', 'closed'] as const
type Filter = (typeof FILTERS)[number]

export default function ExamsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirm, confirmDialog] = useConfirm()
  const exams = useAdminExams()
  const remove = useDeleteExam()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, draft: 0, scheduled: 0, live: 0, closed: 0 }
    for (const e of exams.data ?? []) {
      c.all++
      c[e.status]++
    }
    return c
  }, [exams.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (exams.data ?? []).filter(
      (e) =>
        (filter === 'all' || e.status === filter) &&
        (!q || e.title.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q)),
    )
  }, [exams.data, filter, search])

  async function onDelete(id: string, title: string) {
    const ok = await confirm({
      title: t('exams.confirm.deleteExamTitle'),
      description: t('exams.confirm.deleteExamBody', { title }),
      confirmLabel: t('exams.confirm.delete'),
      destructive: true,
    })
    if (ok) remove.mutate(id)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">{t('exams.listTitle')}</h1>
        <Button variant="press" className="h-11 px-5" onClick={() => void navigate('/admin/exams/new')}>
          <Plus aria-hidden /> {t('exams.actions.create')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('exams.filterLabel')} className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-extrabold transition-colors',
                filter === f
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft',
              )}
            >
              {f === 'all' ? t('exams.filterAll') : t(`exams.status.${f}`)}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  filter === f ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={t('exams.search')}
            placeholder={t('exams.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-full border-2 bg-card pl-9"
          />
        </div>
      </div>

      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(remove.error)}</AlertDescription>
        </Alert>
      )}

      {exams.isPending ? (
        <Loading />
      ) : exams.isError ? (
        <ErrorState message={errorMessage(exams.error)} onRetry={() => void exams.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={counts.all === 0 ? t('exams.emptyAll') : t('exams.emptyFiltered')}
          action={
            counts.all === 0 ? (
              <Button asChild size="sm">
                <Link to="/admin/exams/new">{t('exams.actions.create')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-xl border md:block border-border bg-card card-shadow">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/60 text-left text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">{t('exams.cols.exam')}</th>
                <th scope="col" className="px-4 py-3">{t('exams.cols.window')}</th>
                <th scope="col" className="px-4 py-3 text-right">{t('exams.cols.duration')}</th>
                <th scope="col" className="px-4 py-3 text-right">{t('exams.cols.questions')}</th>
                <th scope="col" className="px-4 py-3 text-right">{t('exams.cols.attempts')}</th>
                <th scope="col" className="px-4 py-3">{t('exams.cols.status')}</th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">{t('exams.preview.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-primary-soft/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <SubjectIcon subject={e.subject} className="size-9 rounded-xl [&>svg]:size-[1.125rem]" />
                      <div className="min-w-0">
                        <Link to={`/admin/exams/${e.id}/manage`} className="font-extrabold hover:text-primary hover:underline">
                          {e.title}
                        </Link>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {e.subject} · {t(`exams.stream.${e.stream}`)}
                          {e.reexam_of && <Badge variant="secondary" className="ml-1.5">{t('reexam.badge')}</Badge>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {e.window_starts_at ? (
                      <>
                        <p className="font-semibold">{formatEAT(e.window_starts_at)}</p>
                        <p className="text-muted-foreground">→ {formatEAT(e.window_ends_at)}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t('exams.noWindow')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold whitespace-nowrap tabular-nums">{t('exams.minutes', { count: e.duration_minutes })}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{e.question_count}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{e.attempt_count}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status as ExamState} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="outline" className="rounded-xl border-2 font-bold">
                        <Link to={`/admin/exams/${e.id}/manage`}>
                          <BarChart3 aria-hidden /> {t('exams.actions.manage')}
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="rounded-xl font-bold">
                        <Link to={`/admin/exams/${e.id}`}>
                          <Pencil aria-hidden /> {e.attempt_count > 0 ? t('exams.actions.view') : t('exams.actions.edit')}
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn('size-8 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive', e.attempt_count > 0 && 'invisible')}
                        onClick={() => void onDelete(e.id, e.title)}
                        disabled={remove.isPending || e.attempt_count > 0}
                        aria-label={t('exams.actions.deleteNamed', { title: e.title })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: one card per exam instead of a sideways-scrolling table. */}
        <ul className="space-y-3 md:hidden">
          {rows.map((e) => (
            <li
              key={e.id}
              className="space-y-3 rounded-xl border border-border bg-card p-4 card-shadow"
            >
              <div className="flex items-start gap-3">
                <SubjectIcon subject={e.subject} />
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/exams/${e.id}/manage`} className="font-extrabold leading-snug hover:text-primary">
                    {e.title}
                  </Link>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {e.subject} · {t(`exams.stream.${e.stream}`)}
                  </p>
                  {e.reexam_of && <Badge variant="secondary" className="mt-1">{t('reexam.badge')}</Badge>}
                </div>
                <StatusBadge status={e.status as ExamState} />
              </div>
              <p className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold">
                {e.window_starts_at ? (
                  <>
                    {formatEAT(e.window_starts_at)}
                    <span className="text-muted-foreground"> → {formatEAT(e.window_ends_at)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t('exams.noWindow')}</span>
                )}
              </p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['duration', t('exams.minutes', { count: e.duration_minutes })],
                    ['questions', e.question_count],
                    ['attempts', e.attempt_count],
                  ] as const
                ).map(([col, value]) => (
                  <div key={col} className="flex flex-col-reverse">
                    <dt className="text-[0.6875rem] font-bold text-muted-foreground uppercase">{t(`exams.cols.${col}`)}</dt>
                    <dd className="text-sm font-extrabold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="h-10 flex-1 rounded-xl border-2 font-bold">
                  <Link to={`/admin/exams/${e.id}/manage`}>
                    <BarChart3 aria-hidden /> {t('exams.actions.manage')}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-10 flex-1 rounded-xl border-2 font-bold">
                  <Link to={`/admin/exams/${e.id}`}>
                    <Pencil aria-hidden /> {e.attempt_count > 0 ? t('exams.actions.view') : t('exams.actions.edit')}
                  </Link>
                </Button>
                {e.attempt_count === 0 && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-10 rounded-xl border-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void onDelete(e.id, e.title)}
                    disabled={remove.isPending}
                    aria-label={t('exams.actions.deleteNamed', { title: e.title })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  )
}
