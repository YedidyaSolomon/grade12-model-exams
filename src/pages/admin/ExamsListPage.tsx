import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
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
    <div className="mx-auto max-w-6xl space-y-4">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('exams.listTitle')}</h1>
        <Button onClick={() => void navigate('/admin/exams/new')}>
          <Plus aria-hidden /> {t('exams.actions.create')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('exams.filterLabel')} className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('exams.filterAll') : t(`exams.status.${f}`)}
              <span className="tabular-nums opacity-70">{counts[f]}</span>
            </Button>
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
            className="h-9 pl-9"
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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2">{t('exams.cols.exam')}</th>
                <th scope="col" className="px-4 py-2">{t('exams.cols.stream')}</th>
                <th scope="col" className="px-4 py-2">{t('exams.cols.window')}</th>
                <th scope="col" className="px-4 py-2 text-right">{t('exams.cols.duration')}</th>
                <th scope="col" className="px-4 py-2 text-right">{t('exams.cols.questions')}</th>
                <th scope="col" className="px-4 py-2 text-right">{t('exams.cols.attempts')}</th>
                <th scope="col" className="px-4 py-2">{t('exams.cols.status')}</th>
                <th scope="col" className="px-4 py-2 text-right">
                  <span className="sr-only">{t('exams.preview.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to={`/admin/exams/${e.id}`} className="font-medium hover:underline">
                      {e.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{e.subject}</p>
                  </td>
                  <td className="px-4 py-3">{t(`exams.stream.${e.stream}`)}</td>
                  <td className="px-4 py-3 text-xs">
                    {e.window_starts_at ? (
                      <>
                        <p>{formatEAT(e.window_starts_at)}</p>
                        <p className="text-muted-foreground">→ {formatEAT(e.window_ends_at)}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t('exams.noWindow')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t('exams.minutes', { count: e.duration_minutes })}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.question_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.attempt_count}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status as ExamState} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/admin/exams/${e.id}`}>
                          <Pencil aria-hidden /> {e.attempt_count > 0 ? t('exams.actions.view') : t('exams.actions.edit')}
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn('size-8 text-destructive hover:text-destructive', e.attempt_count > 0 && 'invisible')}
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
      )}
    </div>
  )
}
