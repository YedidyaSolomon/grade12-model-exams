import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Check, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { usePrompt } from '@/components/PromptDialog'
import { errorMessage } from '@/lib/errors'
import { formatEAT } from '@/lib/time'
import { useReexamRequests, useReviewRequest } from '@/features/admin/api'
import type { ReexamRequest, ReexamStatus } from '@/features/admin/types'
import { RequestStatusBadge } from './StudentDetailPage'

const FILTERS: (ReexamStatus | 'all')[] = ['pending', 'approved', 'rejected', 'all']

export default function RequestsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ReexamStatus | 'all'>('pending')
  const q = useReexamRequests(filter)
  const review = useReviewRequest()
  const [prompt, promptDialog] = usePrompt()
  const [notice, setNotice] = useState<string | null>(null)

  async function onReview(r: ReexamRequest, approve: boolean) {
    const note = await prompt({
      title: approve
        ? t('requests.approveTitle', { name: r.full_name ?? '' })
        : t('requests.rejectTitle', { name: r.full_name ?? '' }),
      description: approve ? t('requests.approveBody', { title: r.exam_title }) : t('requests.rejectBody'),
      label: t('requests.noteLabel'),
      maxLength: 500,
      confirmLabel: approve ? t('requests.approve') : t('requests.reject'),
      destructive: !approve,
    })
    if (note === null) return
    setNotice(null)
    review.mutate(
      { requestId: r.id, approve, note },
      {
        onSuccess: (res) =>
          setNotice(
            approve
              ? res.created_reexam
                ? t('requests.approvedNew')
                : t('requests.approvedExisting')
              : t('requests.rejected'),
          ),
      },
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {promptDialog}
      <h1 className="text-2xl font-semibold">{t('requests.title')}</h1>
      <div role="group" aria-label={t('requests.filterLabel')} className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t('exams.filterAll') : t(`requests.status.${f}`)}
          </Button>
        ))}
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {review.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(review.error)}</AlertDescription>
        </Alert>
      )}

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState title={filter === 'pending' ? t('requests.emptyPending') : t('requests.empty')} />
      ) : (
        <ul className="space-y-3">
          {q.data.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/students/${r.user_id}`} className="font-semibold hover:underline">
                  {r.full_name ?? t('students.noName')}
                </Link>
                <span className="text-muted-foreground">
                  {r.school ?? '—'} · {r.stream ? t(`exams.stream.${r.stream}`) : '—'}
                </span>
                {r.is_banned && <Badge variant="destructive">{t('students.status.banned')}</Badge>}
                <RequestStatusBadge status={r.status} />
                <span className="ml-auto text-xs text-muted-foreground">{formatEAT(r.created_at)}</span>
              </div>
              <p>
                <Link to={`/admin/exams/${r.exam_id}/manage`} className="font-medium hover:underline">
                  {r.exam_title}
                </Link>
                <span className="text-muted-foreground"> · {r.exam_subject}</span>
              </p>
              <blockquote className="border-l-2 pl-3 text-muted-foreground">{r.reason}</blockquote>
              {r.status !== 'pending' && (
                <p className="text-xs text-muted-foreground">
                  {t('requests.reviewedBy', { name: r.reviewer ?? '—', time: r.reviewed_at ? formatEAT(r.reviewed_at) : '' })}
                  {r.admin_note && <> · “{r.admin_note}”</>}
                  {r.reexam_id && (
                    <>
                      {' · '}
                      <Link to={`/admin/exams/${r.reexam_id}/manage?tab=reexams`} className="underline">
                        {r.reexam_title}
                      </Link>
                    </>
                  )}
                </p>
              )}
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void onReview(r, true)} disabled={review.isPending}>
                    <Check aria-hidden /> {t('requests.approve')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onReview(r, false)} disabled={review.isPending}>
                    <X aria-hidden /> {t('requests.reject')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
