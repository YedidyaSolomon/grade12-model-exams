import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarPlus, Copy, Download, Lock, Pencil, RotateCcw, UserMinus, UserPlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { usePrompt } from '@/components/PromptDialog'
import { errorMessage } from '@/lib/errors'
import { eatInputToIso, formatDuration, formatEAT, isoToEatInput } from '@/lib/time'
import { StatusBadge } from '@/features/exams/components/StatusBadge'
import {
  useAddReexamStudents,
  useAddWindow,
  useCreateReexam,
  useExamControl,
  useExamResults,
  useExtendWindow,
  useGrantRetake,
  useRemoveReexamStudent,
  useRevokeRetake,
} from '@/features/admin/api'
import { ScoreHistogram } from '@/features/admin/components/ScoreHistogram'
import { StudentPicker, type PickedStudent } from '@/features/admin/components/StudentPicker'
import type { ExamControl, ExamWindow, QuestionStat } from '@/features/admin/types'

type Tab = 'results' | 'windows' | 'reexams'
const TABS: Tab[] = ['results', 'windows', 'reexams']

export default function ExamManagePage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'results') as Tab
  const control = useExamControl(id)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/admin/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('exams.listTitle')}
      </Link>
      {control.isPending ? (
        <Loading />
      ) : control.isError ? (
        <ErrorState message={errorMessage(control.error)} onRetry={() => void control.refetch()} />
      ) : (
        <>
          <Header c={control.data} />
          <Tabs
            label={t('manage.tabsLabel')}
            value={tab}
            onChange={(v) => setParams(v === 'results' ? {} : { tab: v }, { replace: true })}
            tabs={[
              { value: 'results', label: t('manage.tabs.results') },
              { value: 'windows', label: t('manage.tabs.windows') },
              { value: 'reexams', label: t('manage.tabs.reexams') },
            ]}
          >
            {tab === 'results' && <ResultsTab examId={control.data.id} control={control.data} />}
            {tab === 'windows' && <WindowsTab c={control.data} />}
            {tab === 'reexams' && <ReexamsTab c={control.data} />}
          </Tabs>
        </>
      )}
    </div>
  )
}

function Header({ c }: { c: ExamControl }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-primary">
          {c.title}
          <StatusBadge status={c.status} />
          {c.reexam_of && <Badge variant="secondary">{t('reexam.badge')}</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {c.subject} · {t(`exams.stream.${c.stream}`)} · {t('exams.minutes', { count: c.duration_minutes })}
          {c.reexam_of && c.reexam_of_title && (
            <>
              {' · '}
              {t('reexam.of')}{' '}
              <Link to={`/admin/exams/${c.reexam_of}/manage`} className="hover:underline">
                {c.reexam_of_title}
              </Link>
            </>
          )}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm">
          <Lock className="size-4" aria-hidden />
          {c.released
            ? t('manage.released')
            : c.release_at
              ? t('manage.releaseAt', { time: formatEAT(c.release_at) })
              : t('manage.noWindow')}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to={`/admin/exams/${c.id}`}>
          <Pencil aria-hidden /> {c.attempt_count > 0 ? t('manage.viewQuestions') : t('manage.editExam')}
        </Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
function ResultsTab({ examId, control }: { examId: string; control: ExamControl }) {
  const { t } = useTranslation()
  const q = useExamResults(examId)
  const [prompt, promptDialog] = usePrompt()
  const grant = useGrantRetake()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (q.isPending) return <Loading />
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
  const d = q.data
  const ranked = d.rows.filter((r) => r.rank !== null)
  const pcts = ranked.map((r) => r.percentage ?? 0)
  const avg = pcts.length ? Math.round((10 * pcts.reduce((a, b) => a + b, 0)) / pcts.length) / 10 : null
  const grantedUsers = new Set(control.retake_grants.filter((g) => !g.used).map((g) => g.user_id))

  async function onExport() {
    setExporting(true)
    setExportError(null)
    try {
      const { exportResultsXlsx } = await import('@/features/admin/exportResults')
      await exportResultsXlsx(d)
    } catch (e) {
      setExportError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  async function onGrant(userId: string, name: string | null) {
    const note = await prompt({
      title: t('retake.grantTitle', { name: name ?? '', title: d.exam.title }),
      description: t('retake.grantBody'),
      label: t('retake.note'),
      maxLength: 500,
      confirmLabel: t('retake.grant'),
    })
    if (note === null) return
    setNotice(null)
    grant.mutate({ examId, userId, note }, { onSuccess: () => setNotice(t('retake.granted')) })
  }

  return (
    <div className="space-y-4">
      {promptDialog}
      {!d.exam.released && (
        <Alert>
          <AlertDescription>{t('results.adminBeforeRelease')}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {(grant.error || exportError) && (
        <Alert variant="destructive">
          <AlertDescription>{grant.error ? errorMessage(grant.error) : exportError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="text-lg font-semibold tabular-nums">{d.rows.length}</span> {t('results.submittedCount')}
        </span>
        <span>
          <span className="text-lg font-semibold tabular-nums">{d.in_progress}</span> {t('results.inProgress')}
        </span>
        <span>
          <span className="text-lg font-semibold tabular-nums">{avg ?? '—'}{avg !== null && '%'}</span> {t('results.average')}
        </span>
        <Button className="ml-auto" variant="outline" onClick={() => void onExport()} disabled={exporting || d.rows.length === 0}>
          <Download aria-hidden /> {exporting ? t('results.exporting') : t('results.export')}
        </Button>
      </div>

      {d.rows.length === 0 ? (
        <EmptyState title={t('results.empty')} />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <ScoreHistogram percentages={pcts} />
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">{t('results.tableCaption')}</caption>
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-right">{t('results.cols.rank')}</th>
                  <th scope="col" className="px-3 py-2">{t('results.cols.name')}</th>
                  <th scope="col" className="px-3 py-2">{t('results.cols.school')}</th>
                  <th scope="col" className="px-3 py-2">{t('results.cols.stream')}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t('results.cols.score')}</th>
                  <th scope="col" className="px-3 py-2 text-right">%</th>
                  <th scope="col" className="px-3 py-2 text-right">{t('results.cols.time')}</th>
                  <th scope="col" className="px-3 py-2">{t('results.cols.auto')}</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">{t('exams.preview.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.attempt_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{r.rank ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Link to={`/admin/students/${r.user_id}`} className="hover:underline">
                        {r.full_name ?? t('students.noName')}
                      </Link>
                      {r.is_banned && <Badge variant="destructive" className="ml-1">{t('students.status.banned')}</Badge>}
                      {r.attempt_no > 1 && <span className="text-xs text-muted-foreground"> · {t('students.attemptNo', { n: r.attempt_no })}</span>}
                    </td>
                    <td className="px-3 py-2">{r.school ?? '—'}</td>
                    <td className="px-3 py-2">{r.stream ? t(`exams.stream.${r.stream}`) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.score}/{r.max_score}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.percentage ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDuration(r.time_taken_seconds * 1000)}</td>
                    <td className="px-3 py-2">{r.auto_submitted ? t('common.yes') : ''}</td>
                    <td className="px-3 py-2 text-right">
                      {!d.exam.released && !grantedUsers.has(r.user_id) && (
                        <Button size="sm" variant="ghost" onClick={() => void onGrant(r.user_id, r.full_name)} disabled={grant.isPending}>
                          <RotateCcw aria-hidden /> {t('retake.grant')}
                        </Button>
                      )}
                      {grantedUsers.has(r.user_id) && <Badge variant="secondary">{t('retake.pending')}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <QuestionStats questions={d.questions} />
        </>
      )}
    </div>
  )
}

function QuestionStats({ questions }: { questions: QuestionStat[] }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('results.questionStats')}</CardTitle>
        <CardDescription>{t('results.questionStatsHint')}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3">#</th>
              <th scope="col" className="py-2 pr-3">{t('results.cols.question')}</th>
              <th scope="col" className="py-2 pr-3">{t('results.cols.answer')}</th>
              <th scope="col" className="py-2 pr-3 text-right">{t('results.cols.pctCorrect')}</th>
              <th scope="col" className="py-2">{t('results.cols.mostWrong')}</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const pct = q.participants ? Math.round((100 * q.correct) / q.participants) : 0
              const wrong = (['A', 'B', 'C', 'D'] as const)
                .filter((l) => l !== q.correct_option)
                .map((l) => ({ l, n: q.counts[l] }))
                .sort((a, b) => b.n - a.n)[0]
              return (
                <tr key={q.id} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3 tabular-nums">{q.position}</td>
                  <td className="max-w-md py-2 pr-3">
                    <p className="line-clamp-2">{q.body}</p>
                  </td>
                  <td className="py-2 pr-3 font-medium">{q.correct_option ?? '—'}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-10 tabular-nums">{pct}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-sm">
                    {wrong && wrong.n > 0 ? (
                      <>
                        <span className="font-medium">{wrong.l}</span>{' '}
                        <span className="text-muted-foreground">
                          {t('results.chosenBy', { count: wrong.n })} · {q.options[wrong.l.charCodeAt(0) - 65]}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Windows & retakes (before release only)
// ---------------------------------------------------------------------------
function WindowsTab({ c }: { c: ExamControl }) {
  const { t } = useTranslation()
  const [confirm, confirmDialog] = useConfirm()
  const revoke = useRevokeRetake()
  const locked = c.released || !c.published_at

  async function onRevoke(grantId: string) {
    const ok = await confirm({ title: t('retake.revokeTitle'), confirmLabel: t('retake.revoke'), destructive: true })
    if (ok) revoke.mutate(grantId)
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {c.released ? (
        <Alert>
          <AlertDescription>{t('manage.windowsLockedReleased')}</AlertDescription>
        </Alert>
      ) : !c.published_at ? (
        <Alert>
          <AlertDescription>{t('manage.windowsDraft')}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('manage.windows')}</CardTitle>
          <CardDescription>{t('manage.windowsHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {c.windows.length === 0 ? (
            <EmptyState title={t('manage.noWindow')} />
          ) : (
            <ul className="divide-y">
              {c.windows.map((w) => (
                <WindowRow key={w.id} w={w} locked={locked} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!locked && <AddWindowForm c={c} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('retake.title')}</CardTitle>
          <CardDescription>{c.released ? t('retake.lockedReleased') : t('retake.hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {revoke.isError && <p className="mb-2 text-sm text-destructive">{errorMessage(revoke.error)}</p>}
          {c.retake_grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('retake.none')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.retake_grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link to={`/admin/students/${g.user_id}`} className="font-medium hover:underline">
                    {g.full_name ?? t('students.noName')}
                  </Link>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function WindowRow({ w, locked }: { w: ExamWindow; locked: boolean }) {
  const { t } = useTranslation()
  const extend = useExtendWindow()
  const [confirm, confirmDialog] = useConfirm()
  const [open, setOpen] = useState(false)
  const [end, setEnd] = useState(isoToEatInput(w.ends_at))
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const iso = eatInputToIso(end)
    if (!iso) return
    const ok = await confirm({
      title: t('manage.extendConfirmTitle'),
      description: t('manage.extendConfirmBody', { from: formatEAT(w.ends_at), to: formatEAT(iso) }),
      confirmLabel: t('manage.extend'),
    })
    if (!ok) return
    extend.mutate(
      { windowId: w.id, endsAt: iso },
      {
        onSuccess: (r) => {
          setOpen(false)
          setNotice(t('manage.extended', { count: r.extended_attempts }))
        },
      },
    )
  }

  return (
    <li className="space-y-2 py-3 text-sm">
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">
          {formatEAT(w.starts_at)} → {formatEAT(w.ends_at)}
        </span>
        {w.is_reopen && <Badge variant="secondary">{t('manage.addedWindow')}</Badge>}
        {w.restricted && <Badge variant="warning">{t('manage.restricted', { count: w.allowed_users.length })}</Badge>}
        <span className="text-xs text-muted-foreground">{t('manage.windowAttempts', { count: w.attempt_count })}</span>
        {!locked && !open && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}>
            {t('manage.extend')}
          </Button>
        )}
      </div>
      {w.restricted && w.allowed_users.length > 0 && (
        <p className="text-xs text-muted-foreground">{w.allowed_users.map((u) => u.full_name ?? '—').join(', ')}</p>
      )}
      {open && (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`end-${w.id}`}>{t('manage.newEnd')}</Label>
            <Input id={`end-${w.id}`} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" required />
          </div>
          <Button type="submit" size="sm" disabled={extend.isPending}>
            {t('manage.extend')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      )}
      {notice && <p className="text-xs text-success">{notice}</p>}
      {extend.isError && <p className="text-xs text-destructive">{errorMessage(extend.error)}</p>}
    </li>
  )
}

function AddWindowForm({ c }: { c: ExamControl }) {
  const { t } = useTranslation()
  const add = useAddWindow()
  const [confirm, confirmDialog] = useConfirm()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [restricted, setRestricted] = useState(true)
  const [students, setStudents] = useState<PickedStudent[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const startIso = eatInputToIso(start)
  const endIso = eatInputToIso(end)
  const valid = !!startIso && !!endIso && (!restricted || students.length > 0)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const ok = await confirm({
      title: t('manage.addWindowConfirmTitle'),
      description: restricted
        ? t('manage.addWindowConfirmRestricted', { count: students.length, start: formatEAT(startIso!), end: formatEAT(endIso!) })
        : t('manage.addWindowConfirmOpen', { start: formatEAT(startIso!), end: formatEAT(endIso!) }),
      confirmLabel: t('manage.addWindow'),
    })
    if (!ok) return
    setNotice(null)
    add.mutate(
      { examId: c.id, startsAt: startIso!, endsAt: endIso!, userIds: restricted ? students.map((s) => s.id) : [] },
      {
        onSuccess: () => {
          setStart('')
          setEnd('')
          setStudents([])
          setNotice(t('manage.windowAdded'))
        },
      },
    )
  }

  return (
    <Card>
      {confirmDialog}
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarPlus className="size-4" aria-hidden /> {t('manage.addWindow')}
        </CardTitle>
        <CardDescription>{t('manage.addWindowHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="aw-start">{t('exams.fields.windowStart')}</Label>
              <Input id="aw-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aw-end">{t('exams.fields.windowEnd')}</Label>
              <Input id="aw-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('exams.fields.windowHint')}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
            {t('manage.restrictToStudents')}
          </label>
          {restricted && <StudentPicker value={students} onChange={setStudents} label={t('manage.allowedStudents')} />}
          {!restricted && <p className="text-xs text-muted-foreground">{t('manage.openWindowHint')}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!valid || add.isPending}>
              {t('manage.addWindow')}
            </Button>
            {notice && <span className="text-sm text-success">{notice}</span>}
            {add.isError && <span className="text-sm text-destructive">{errorMessage(add.error)}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Re-exams (after release only)
// ---------------------------------------------------------------------------
function ReexamsTab({ c }: { c: ExamControl }) {
  return c.reexam_of ? <ReexamStudents c={c} /> : <ReexamList c={c} />
}

function ReexamList({ c }: { c: ExamControl }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateReexam()
  const [confirm, confirmDialog] = useConfirm()

  async function onCreate() {
    const ok = await confirm({
      title: t('reexam.createTitle'),
      description: t('reexam.createBody'),
      confirmLabel: t('reexam.create'),
    })
    if (!ok) return
    create.mutate(c.id, { onSuccess: (newId) => void navigate(`/admin/exams/${newId}/manage?tab=reexams`) })
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reexam.title')}</CardTitle>
          <CardDescription>{c.released ? t('reexam.hint') : t('reexam.notYet')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => void onCreate()} disabled={!c.released || create.isPending}>
            <Copy aria-hidden /> {t('reexam.create')}
          </Button>
          {create.isError && <p className="text-sm text-destructive">{errorMessage(create.error)}</p>}
          {c.reexams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reexam.none')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.reexams.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link to={`/admin/exams/${r.id}/manage?tab=reexams`} className="font-medium hover:underline">
                    {r.title}
                  </Link>
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-muted-foreground">
                    {t('reexam.students', { count: r.student_count })} · {t('manage.windowAttempts', { count: r.attempt_count })}
                  </span>
                  <Button asChild size="sm" variant="ghost" className="ml-auto">
                    <Link to={`/admin/exams/${r.id}`}>
                      <Pencil aria-hidden /> {r.published_at ? t('exams.actions.view') : t('exams.actions.edit')}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReexamStudents({ c }: { c: ExamControl }) {
  const { t } = useTranslation()
  const add = useAddReexamStudents()
  const remove = useRemoveReexamStudent()
  const [confirm, confirmDialog] = useConfirm()
  const [picked, setPicked] = useState<PickedStudent[]>([])
  const onList = useMemo(() => new Set(c.reexam_students.map((s) => s.user_id)), [c.reexam_students])
  const toAdd = picked.filter((p) => !onList.has(p.id))

  async function onRemove(userId: string, name: string | null) {
    const ok = await confirm({
      title: t('reexam.removeTitle', { name: name ?? '' }),
      confirmLabel: t('reexam.remove'),
      destructive: true,
    })
    if (ok) remove.mutate({ reexamId: c.id, userId })
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {!c.published_at && (
        <Alert>
          <AlertDescription>
            {t('reexam.draftHint')}{' '}
            <Link to={`/admin/exams/${c.id}`} className="font-medium underline">
              {t('reexam.openEditor')}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reexam.approvedStudents')}</CardTitle>
          <CardDescription>{t('reexam.approvedHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {remove.isError && <p className="text-sm text-destructive">{errorMessage(remove.error)}</p>}
          {c.reexam_students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reexam.noStudents')}</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.reexam_students.map((s) => (
                <li key={s.user_id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link to={`/admin/students/${s.user_id}`} className="font-medium hover:underline">
                    {s.full_name ?? t('students.noName')}
                  </Link>
                  <span className="text-xs text-muted-foreground">{s.school ?? ''}</span>
                  {s.request_id && <Badge variant="secondary">{t('reexam.fromRequest')}</Badge>}
                  {s.has_attempt ? (
                    <Badge variant="success" className="ml-auto">{t('reexam.took')}</Badge>
                  ) : (
                    !c.released && (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void onRemove(s.user_id, s.full_name)} disabled={remove.isPending}>
                        <UserMinus aria-hidden /> {t('reexam.remove')}
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}

          {!c.released && (
            <div className="space-y-2 border-t pt-3">
              <StudentPicker value={picked} onChange={setPicked} label={t('reexam.addStudents')} />
              <Button
                size="sm"
                disabled={toAdd.length === 0 || add.isPending}
                onClick={() =>
                  add.mutate({ reexamId: c.id, userIds: toAdd.map((p) => p.id) }, { onSuccess: () => setPicked([]) })
                }
              >
                <UserPlus aria-hidden /> {t('reexam.addN', { count: toAdd.length })}
              </Button>
              {add.isError && <p className="text-sm text-destructive">{errorMessage(add.error)}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
