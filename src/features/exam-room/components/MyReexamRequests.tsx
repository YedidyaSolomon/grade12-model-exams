import { useTranslation } from 'react-i18next'
import { ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useMyReexamRequests, type MyReexamRequest } from '../api'

const STATUS_TONE = {
  pending: 'bg-gold-soft text-gold-foreground',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-live-soft text-live',
} as const

function Status({ status }: { status: MyReexamRequest['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap', STATUS_TONE[status])}>
      {t(`requests.status.${status}`)}
    </span>
  )
}

/** "Your re-exam requests": table on laptop, stacked cards on phones. Hidden when empty. */
export function MyReexamRequests() {
  const { t } = useTranslation()
  const q = useMyReexamRequests()

  if (q.isPending) return <Loading />
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
  if (q.data.length === 0) return null

  return (
    <section aria-labelledby="my-requests" className="space-y-3">
      <div>
        <h2 id="my-requests" className="text-lg font-extrabold text-primary">
          {t('reexamRequest.list.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('reexamRequest.list.subtitle')}</p>
      </div>

      {/* Phone */}
      <ul className="space-y-2 md:hidden">
        {q.data.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border bg-card p-4 card-shadow">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-bold text-primary">{r.exam?.title ?? '—'}</p>
              <Status status={r.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`reexamRequest.categories.${r.reason_category}`)} · {formatEAT(r.created_at)}
            </p>
            <p className="text-sm">{r.reason}</p>
            {r.admin_note && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-semibold">{t('reexamRequest.adminNote')}:</span> {r.admin_note}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* Laptop */}
      <div className="hidden overflow-hidden rounded-xl border bg-card card-shadow md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-background text-[0.6875rem] font-bold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">{t('reexamRequest.list.exam')}</th>
              <th scope="col" className="px-4 py-3">{t('reexamRequest.list.reason')}</th>
              <th scope="col" className="px-4 py-3">{t('reexamRequest.list.status')}</th>
              <th scope="col" className="px-4 py-3">{t('reexamRequest.adminNote')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {q.data.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-bold text-primary">{r.exam?.title ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{t('reexamRequest.list.sentAt', { time: formatEAT(r.created_at) })}</p>
                </td>
                <td className="max-w-xs px-4 py-3">
                  <p className="font-semibold">{t(`reexamRequest.categories.${r.reason_category}`)}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.reason}</p>
                </td>
                <td className="px-4 py-3">
                  <Status status={r.status} />
                </td>
                <td className="max-w-xs px-4 py-3 text-muted-foreground">{r.admin_note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
