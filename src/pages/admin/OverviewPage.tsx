import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Ban, Inbox, PenLine, Radio, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { useAdminOverview } from '@/features/admin/api'
import { AuditList } from '@/features/admin/components/AuditList'

export default function OverviewPage() {
  const { t } = useTranslation()
  const q = useAdminOverview()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('admin.overview')}</h1>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat to="/admin/students" icon={<Users className="size-4" aria-hidden />} label={t('overview.students')} value={q.data.total_students}
              sub={q.data.incomplete ? t('overview.incomplete', { count: q.data.incomplete }) : undefined} />
            <Stat to="/admin/students?status=banned" icon={<Ban className="size-4" aria-hidden />} label={t('overview.banned')} value={q.data.banned} />
            <Stat to="/admin/exams" icon={<Radio className="size-4" aria-hidden />} label={t('overview.liveExams')} value={q.data.live_exams} />
            <Stat icon={<PenLine className="size-4" aria-hidden />} label={t('overview.writingNow')} value={q.data.writing_now} />
            <Stat to="/admin/requests" icon={<Inbox className="size-4" aria-hidden />} label={t('overview.pendingRequests')} value={q.data.pending_requests} highlight={q.data.pending_requests > 0} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('overview.liveNow')}</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data.live.length === 0 ? (
                <EmptyState title={t('overview.noLive')} />
              ) : (
                <ul className="divide-y text-sm">
                  {q.data.live.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                      <Link to={`/admin/exams/${e.id}/manage`} className="font-medium hover:underline">
                        {e.title}
                      </Link>
                      <span className="tabular-nums">{t('overview.writing', { count: e.writing })}</span>
                      <span className="tabular-nums text-muted-foreground">{t('overview.submitted', { count: e.submitted })}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{t('overview.closes', { time: formatEAT(e.live_ends_at) })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('overview.recentActions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditList entries={q.data.recent_actions} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  to,
  highlight,
}: {
  icon: ReactNode
  label: string
  value: number
  sub?: string
  to?: string
  highlight?: boolean
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </>
  )
  const cls = `block rounded-xl border bg-card p-4 ${highlight ? 'border-warning' : ''}`
  return to ? (
    <Link to={to} className={`${cls} hover:bg-muted/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
