import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { STUDENTS_PAGE_SIZE, useStudents } from '@/features/admin/api'
import type { Stream, StudentRow, StudentStatus } from '@/features/admin/types'

const STATUSES: StudentStatus[] = ['active', 'banned', 'incomplete']

export function StudentStatusBadge({ s }: { s: Pick<StudentRow, 'is_banned' | 'is_complete'> }) {
  const { t } = useTranslation()
  if (s.is_banned) return <Badge variant="destructive">{t('students.status.banned')}</Badge>
  if (!s.is_complete) return <Badge variant="warning">{t('students.status.incomplete')}</Badge>
  return <Badge variant="success">{t('students.status.active')}</Badge>
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('students.title')}</h1>
        {q.data && <p className="text-sm text-muted-foreground tabular-nums">{t('students.count', { count: total })}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setParam('q', e.target.value)
            }}
            placeholder={t('students.searchPlaceholder')}
            aria-label={t('students.searchPlaceholder')}
            className="h-9 pl-9"
          />
        </div>
        <NativeSelect
          aria-label={t('students.filterStream')}
          value={stream}
          onChange={(e) => setParam('stream', e.target.value)}
          className="h-9 w-auto"
        >
          <option value="">{t('students.allStreams')}</option>
          <option value="natural">{t('exams.stream.natural')}</option>
          <option value="social">{t('exams.stream.social')}</option>
        </NativeSelect>
        <NativeSelect
          aria-label={t('students.filterStatus')}
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          className="h-9 w-auto"
        >
          <option value="">{t('students.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`students.status.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.rows.length === 0 ? (
        <EmptyState title={t('students.empty')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2">{t('students.cols.name')}</th>
                  <th scope="col" className="px-4 py-2">{t('students.cols.school')}</th>
                  <th scope="col" className="px-4 py-2">{t('students.cols.stream')}</th>
                  <th scope="col" className="px-4 py-2">{t('students.cols.status')}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t('students.cols.exams')}</th>
                  <th scope="col" className="px-4 py-2">{t('students.cols.joined')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/students/${s.id}`} className="font-medium hover:underline">
                        {s.full_name ?? t('students.noName')}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {s.email ?? (s.telegram_username ? `@${s.telegram_username}` : '')}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">{s.school ?? '—'}</td>
                    <td className="px-4 py-2.5">{s.stream ? t(`exams.stream.${s.stream}`) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <StudentStatusBadge s={s} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.attempt_count}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatEAT(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-end gap-2 text-sm" aria-label={t('students.pagination')}>
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setParam('page', String(page - 1))}>
                {t('students.prev')}
              </Button>
              <span className="tabular-nums">{t('students.page', { page: page + 1, pages })}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setParam('page', String(page + 1))}>
                {t('students.next')}
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
