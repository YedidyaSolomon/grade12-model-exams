import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Ban, RotateCcw, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { usePrompt } from '@/components/PromptDialog'
import { errorMessage } from '@/lib/errors'
import { formatDuration, formatEAT } from '@/lib/time'
import { useGrantRetake, useRevokeRetake, useSetBan, useStudent, useUpdateStudent } from '@/features/admin/api'
import { AuditList } from '@/features/admin/components/AuditList'
import type { Stream, StudentDetail } from '@/features/admin/types'
import { StudentStatusBadge } from './StudentsPage'

export default function StudentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const q = useStudent(id)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/admin/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('students.title')}
      </Link>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <Detail s={q.data} />
      )}
    </div>
  )
}

function Detail({ s }: { s: StudentDetail }) {
  const { t } = useTranslation()
  const [confirm, confirmDialog] = useConfirm()
  const [prompt, promptDialog] = usePrompt()
  const ban = useSetBan()
  const grant = useGrantRetake()
  const revoke = useRevokeRetake()
  const [notice, setNotice] = useState<string | null>(null)

  async function onBan() {
    const reason = await prompt({
      title: t('students.ban.title', { name: s.full_name ?? '' }),
      description: t('students.ban.body'),
      label: t('students.ban.reason'),
      placeholder: t('students.ban.reasonPlaceholder'),
      minLength: 3,
      maxLength: 500,
      confirmLabel: t('students.ban.confirm'),
      destructive: true,
    })
    if (reason === null) return
    setNotice(null)
    ban.mutate(
      { userId: s.id, banned: true, reason },
      {
        onSuccess: (r) =>
          setNotice(
            r.closed_attempts.length
              ? t('students.ban.doneClosed', { count: r.closed_attempts.length })
              : t('students.ban.done'),
          ),
      },
    )
  }

  async function onUnban() {
    const ok = await confirm({
      title: t('students.unban.title', { name: s.full_name ?? '' }),
      description: t('students.unban.body'),
      confirmLabel: t('students.unban.confirm'),
    })
    if (!ok) return
    setNotice(null)
    ban.mutate({ userId: s.id, banned: false }, { onSuccess: () => setNotice(t('students.unban.done')) })
  }

  async function onGrant(examId: string, title: string) {
    const note = await prompt({
      title: t('retake.grantTitle', { name: s.full_name ?? '', title }),
      description: t('retake.grantBody'),
      label: t('retake.note'),
      maxLength: 500,
      confirmLabel: t('retake.grant'),
    })
    if (note === null) return
    setNotice(null)
    grant.mutate({ examId, userId: s.id, note }, { onSuccess: () => setNotice(t('retake.granted')) })
  }

  async function onRevoke(grantId: string) {
    const ok = await confirm({ title: t('retake.revokeTitle'), confirmLabel: t('retake.revoke'), destructive: true })
    if (ok) revoke.mutate(grantId)
  }

  const mutationError = ban.error ?? grant.error ?? revoke.error

  return (
    <>
      {confirmDialog}
      {promptDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{s.full_name ?? t('students.noName')}</h1>
          <p className="text-sm text-muted-foreground">
            {s.email ?? (s.telegram_username ? `@${s.telegram_username}` : '')} · {t('students.joined', { time: formatEAT(s.created_at) })}
            {s.last_sign_in_at && <> · {t('students.lastSignIn', { time: formatEAT(s.last_sign_in_at) })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StudentStatusBadge s={s} />
          {s.role === 'admin' ? (
            <Badge variant="secondary">{t('students.admin')}</Badge>
          ) : s.is_banned ? (
            <Button variant="outline" onClick={() => void onUnban()} disabled={ban.isPending}>
              <ShieldCheck aria-hidden /> {t('students.unban.action')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => void onBan()} disabled={ban.isPending}>
              <Ban aria-hidden /> {t('students.ban.action')}
            </Button>
          )}
        </div>
      </div>

      {s.is_banned && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('students.bannedSince', { time: s.banned_at ? formatEAT(s.banned_at) : '—' })}
            {s.ban_reason && <> — “{s.ban_reason}”</>}
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(mutationError)}</AlertDescription>
        </Alert>
      )}

      <ProfileForm s={s} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('students.attempts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {s.attempts.length === 0 ? (
            <EmptyState title={t('students.noAttempts')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3">{t('results.cols.exam')}</th>
                    <th scope="col" className="py-2 pr-3">{t('results.cols.submitted')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('results.cols.score')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('results.cols.rank')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('results.cols.time')}</th>
                    <th scope="col" className="py-2"><span className="sr-only">{t('exams.preview.actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {s.attempts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Link to={`/admin/exams/${a.exam_id}/manage`} className="font-medium hover:underline">
                          {a.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {' '}· {a.subject}
                          {a.attempt_no > 1 && <> · {t('students.attemptNo', { n: a.attempt_no })}</>}
                        </span>
                        {a.is_reexam && <Badge variant="secondary" className="ml-1">{t('reexam.badge')}</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {a.submitted_at ? formatEAT(a.submitted_at) : <Badge variant="live">{t('students.writing')}</Badge>}
                        {a.auto_submitted && <Badge variant="secondary" className="ml-1">{t('dashboard.autoSubmitted')}</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {a.score !== null ? `${a.score}/${a.max_score}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {a.rank ? `${a.rank}/${a.total}` : '—'}
                        {!a.released && a.submitted_at && (
                          <span className="block text-[10px] text-muted-foreground">{t('results.notReleasedShort')}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {a.submitted_at ? formatDuration(new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {a.can_grant_retake && (
                          <Button size="sm" variant="outline" onClick={() => void onGrant(a.exam_id, a.title)} disabled={grant.isPending}>
                            <RotateCcw aria-hidden /> {t('retake.grant')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {s.retake_grants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('retake.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {s.retake_grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{g.title}</span>
                  {g.note && <span className="text-muted-foreground">“{g.note}”</span>}
                  <span className="text-xs text-muted-foreground">{formatEAT(g.created_at)}</span>
                  <span className="ml-auto">
                    {g.used ? (
                      <Badge variant="secondary">{t('retake.used', { time: formatEAT(g.used_at!) })}</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => void onRevoke(g.id)} disabled={revoke.isPending}>
                        {t('retake.revoke')}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {s.requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('requests.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {s.requests.map((r) => (
                <li key={r.id} className="space-y-1 py-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <RequestStatusBadge status={r.status} />
                    <span className="text-xs text-muted-foreground">{formatEAT(r.created_at)}</span>
                  </p>
                  <p className="text-muted-foreground">“{r.reason}”</p>
                  {r.admin_note && <p className="text-xs">{t('requests.note')}: {r.admin_note}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('audit.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditList entries={s.audit} showTarget={false} />
        </CardContent>
      </Card>
    </>
  )
}

export function RequestStatusBadge({ status }: { status: StudentDetail['requests'][number]['status'] }) {
  const { t } = useTranslation()
  const variant = status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'
  return <Badge variant={variant}>{t(`requests.status.${status}`)}</Badge>
}

function ProfileForm({ s }: { s: StudentDetail }) {
  const { t } = useTranslation()
  const update = useUpdateStudent(s.id)
  const [fullName, setFullName] = useState(s.full_name ?? '')
  const [school, setSchool] = useState(s.school ?? '')
  const [stream, setStream] = useState<Stream | ''>(s.stream ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setFullName(s.full_name ?? '')
    setSchool(s.school ?? '')
    setStream(s.stream ?? '')
  }, [s.full_name, s.school, s.stream])

  const nameOk = fullName.trim().length >= 2 && fullName.trim().length <= 120
  const schoolOk = school.trim().length >= 2 && school.trim().length <= 160
  const dirty = fullName !== (s.full_name ?? '') || school !== (s.school ?? '') || stream !== (s.stream ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nameOk || !schoolOk || !stream) return
    setSaved(false)
    update.mutate(
      { full_name: fullName.trim(), school: school.trim(), stream },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('students.profile')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="st-name">{t('profile.fullName')}</Label>
            <Input id="st-name" value={fullName} onChange={(e) => setFullName(e.target.value)} aria-invalid={!nameOk} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-school">{t('profile.school')}</Label>
            <Input id="st-school" value={school} onChange={(e) => setSchool(e.target.value)} aria-invalid={!schoolOk} maxLength={160} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-stream">{t('profile.stream')}</Label>
            <NativeSelect id="st-stream" value={stream} onChange={(e) => setStream(e.target.value as Stream)}>
              <option value="" disabled>—</option>
              <option value="natural">{t('profile.natural')}</option>
              <option value="social">{t('profile.social')}</option>
            </NativeSelect>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button type="submit" disabled={!dirty || !nameOk || !schoolOk || !stream || update.isPending}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
            {saved && !dirty && <span className="text-sm text-success">{t('students.profileSaved')}</span>}
            {update.isError && <span className="text-sm text-destructive">{errorMessage(update.error)}</span>}
            {stream !== (s.stream ?? '') && s.stream && (
              <span className="text-xs text-muted-foreground">{t('students.streamChangeHint')}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
