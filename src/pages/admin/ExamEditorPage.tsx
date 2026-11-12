import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileUp,
  ListChecks,
  ListOrdered,
  Lock,
  PenLine,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs } from '@/components/ui/tabs'
import { ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage, rpcProblems } from '@/lib/errors'
import { formatEAT, formatSkew, eatInputToIso } from '@/lib/time'
import { useServerClock } from '@/features/exam-room/useServerClock'
import {
  adminExamToDraft,
  useAdminExam,
  useCreateExam,
  useDeleteExam,
  useUpdateAnswerKeys,
  useUpdateExam,
} from '@/features/exams/api'
import { analyzeDraft, type Problem } from '@/features/exams/validation'
import { emptyDraft, type AdminExam, type DraftQuestion, type ExamDraft, type OptionLetter } from '@/features/exams/types'
import { ExamDetailsForm } from '@/features/exams/components/ExamDetailsForm'
import { QuestionForm } from '@/features/exams/components/QuestionForm'
import { PreviewTable } from '@/features/exams/components/PreviewTable'
import { UploadQuestions } from '@/features/exams/components/UploadQuestions'
import { StatusBadge } from '@/features/exams/components/StatusBadge'
import { cn } from '@/lib/utils'

const LOCAL_DRAFT_KEY = 'admin:exam-draft:new'

export default function ExamEditorPage() {
  const { id } = useParams()
  const exam = useAdminExam(id)

  if (!id) return <ExamEditor />
  if (exam.isPending) return <Loading />
  if (exam.isError) return <ErrorState message={errorMessage(exam.error)} onRetry={() => void exam.refetch()} />
  // key: remount with fresh state if the server copy changes identity (after save)
  return <ExamEditor key={`${exam.data.id}:${exam.data.updated_at}`} exam={exam.data} />
}

// ---------------------------------------------------------------------------

function loadLocalDraft(): ExamDraft | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as ExamDraft) : null
  } catch {
    return null
  }
}

function clearLocalDraft() {
  try {
    localStorage.removeItem(LOCAL_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

function renumber(questions: DraftQuestion[]): DraftQuestion[] {
  return [...questions].sort((a, b) => a.number - b.number).map((q, i) => ({ ...q, number: i + 1 }))
}

function ExamEditor({ exam }: { exam?: AdminExam }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [confirm, confirmDialog] = useConfirm()

  const isNew = !exam
  const answersOnly = (exam?.attempt_count ?? 0) > 0
  const isPublished = !!exam?.published_at

  const [restoredLocal] = useState(() => (isNew ? loadLocalDraft() : null))
  const [draft, setDraft] = useState<ExamDraft>(() =>
    exam ? adminExamToDraft(exam) : (restoredLocal ?? emptyDraft()),
  )
  const [showRestored, setShowRestored] = useState(!!restoredLocal)
  const [dirty, setDirty] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  // New, empty exam: start on Import (as in the design); otherwise on the manual editor.
  const [tab, setTab] = useState<'manual' | 'upload'>(() => (draft.questions.length === 0 ? 'upload' : 'manual'))
  // Notices survive the remount that follows a save (fresh server copy) via router state.
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  )
  const showNotice = (msg: string) => {
    setNotice(msg)
    void navigate(location.pathname, { replace: true, state: { notice: msg } })
  }

  const create = useCreateExam()
  const update = useUpdateExam(exam?.id ?? '')
  const updateKeys = useUpdateAnswerKeys(exam?.id ?? '')
  const remove = useDeleteExam()
  const activeMutation = create.isPending || update.isPending || updateKeys.isPending || remove.isPending
  const lastError = create.error ?? update.error ?? updateKeys.error ?? remove.error
  const serverProblems = rpcProblems(lastError)

  // Window checks use the SERVER clock and re-run every 15 s, so a window that ends while
  // the admin is editing is noticed, and a wrong device clock can't block or allow publishing.
  const clock = useServerClock(0, 15_000)
  const report = useMemo(() => analyzeDraft(draft, clock.now), [draft, clock.now])
  const canPublish = report.publishable && clock.synced
  const editing = draft.questions.find((q) => q.key === editingKey) ?? null
  const nextNumber = draft.questions.reduce((m, q) => Math.max(m, q.number), 0) + 1
  const totalPoints = draft.questions.reduce((s, q) => s + (Number.isNaN(q.points) ? 0 : q.points), 0)

  // Keep an unsaved new exam in localStorage so a refresh / crash doesn't lose work.
  useEffect(() => {
    if (!isNew || !dirty) return
    const h = window.setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft))
      } catch {
        /* storage full or blocked */
      }
    }, 500)
    return () => window.clearTimeout(h)
  }, [draft, dirty, isNew])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function change(patch: Partial<ExamDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
    setNotice(null)
  }

  function setQuestions(fn: (qs: DraftQuestion[]) => DraftQuestion[]) {
    setDraft((d) => ({ ...d, questions: fn(d.questions) }))
    setDirty(true)
    setNotice(null)
  }

  // ---- question operations -------------------------------------------------
  /** From the Import tab. Append keeps the file's own numbering (so its gaps still get
   *  flagged), shifted to start after the current last question. `sourcePath` is where
   *  the original file was stored (null if that upload failed: keep the previous link). */
  function importQuestions(
    imported: DraftQuestion[],
    mode: 'replace' | 'append',
    fileName: string,
    sourcePath: string | null,
  ) {
    setDraft((d) => {
      let questions = imported
      if (mode === 'append' && d.questions.length > 0) {
        const start = d.questions.reduce((m, q) => Math.max(m, q.number), 0) + 1
        const first = Math.min(...imported.map((q) => q.number))
        questions = [...d.questions, ...imported.map((q) => ({ ...q, number: q.number - first + start }))]
      }
      return { ...d, questions, sourceFile: sourcePath ?? d.sourceFile }
    })
    setDirty(true)
    setEditingKey(null)
    setNotice(t('exams.upload.imported', { count: imported.length, file: fileName }))
  }

  function upsertQuestion(q: DraftQuestion) {
    if (editingKey) {
      setQuestions((qs) => qs.map((x) => (x.key === editingKey ? q : x)))
      setEditingKey(null)
    } else {
      setQuestions((qs) => [...qs, { ...q, number: nextNumber }])
    }
  }

  async function deleteQuestion(key: string) {
    const q = draft.questions.find((x) => x.key === key)
    if (!q) return
    const ok = await confirm({
      title: t('exams.confirm.deleteQuestionTitle', { number: q.number }),
      description: q.body.slice(0, 160),
      confirmLabel: t('exams.confirm.delete'),
      destructive: true,
    })
    if (!ok) return
    if (editingKey === key) setEditingKey(null)
    setQuestions((qs) => renumber(qs.filter((x) => x.key !== key)))
  }

  function moveQuestion(key: string, dir: -1 | 1) {
    setQuestions((qs) => {
      const sorted = renumber(qs)
      const i = sorted.findIndex((x) => x.key === key)
      const j = i + dir
      const a = sorted[i]
      const b = sorted[j]
      if (!a || !b) return qs
      sorted[i] = { ...b, number: a.number }
      sorted[j] = { ...a, number: b.number }
      return sorted
    })
  }

  function changeCorrect(key: string, letter: OptionLetter) {
    setQuestions((qs) => qs.map((x) => (x.key === key ? { ...x, correct: letter } : x)))
  }

  // ---- save actions ----------------------------------------------------------
  async function save(publish: boolean) {
    setNotice(null)
    if (publish && !isPublished) {
      const starts = eatInputToIso(draft.windowStart)
      const ends = eatInputToIso(draft.windowEnd)
      const ok = await confirm({
        title: t('exams.confirm.publishTitle'),
        description: t('exams.confirm.publishBody', {
          count: draft.questions.length,
          start: starts ? formatEAT(starts) : '—',
          end: ends ? formatEAT(ends) : '—',
        }),
        confirmLabel: t('exams.actions.publish'),
      })
      if (!ok) return
    }
    if (isNew) {
      create.mutate(
        { draft, publish },
        {
          onSuccess: (id) => {
            clearLocalDraft()
            setDirty(false)
            void navigate(`/admin/exams/${id}`, { replace: true, state: { notice: t('exams.notice.created') } })
          },
        },
      )
    } else {
      update.mutate(
        { draft, publish },
        {
          onSuccess: () => {
            setDirty(false)
            showNotice(t('exams.notice.saved'))
          },
        },
      )
    }
  }

  async function unpublish() {
    const ok = await confirm({
      title: t('exams.confirm.unpublishTitle'),
      description: t('exams.confirm.unpublishBody'),
      confirmLabel: t('exams.actions.unpublish'),
      destructive: true,
    })
    if (ok)
      update.mutate(
        { draft, publish: false },
        {
          onSuccess: () => {
            setDirty(false)
            showNotice(t('exams.notice.unpublished'))
          },
        },
      )
  }

  async function saveKeys() {
    if (!exam) return
    const original = new Map(exam.questions.map((q) => [q.id, q.correct_option]))
    const changed = draft.questions
      .filter((q) => q.id && q.correct && original.get(q.id) !== q.correct)
      .map((q) => ({ question_id: q.id!, correct_option: q.correct! }))
    if (changed.length === 0) return
    const ok = await confirm({
      title: t('exams.confirm.keysTitle'),
      description: t('exams.confirm.keysBody', { count: changed.length, attempts: exam.attempt_count }),
      confirmLabel: t('exams.actions.saveKeys'),
    })
    if (!ok) return
    updateKeys.mutate(changed, {
      onSuccess: (r) => {
        setDirty(false)
        showNotice(t('exams.notice.regraded', { changed: r.changed, regraded: r.regraded }))
      },
    })
  }

  async function deleteExam() {
    if (!exam) return
    const ok = await confirm({
      title: t('exams.confirm.deleteExamTitle'),
      description: t('exams.confirm.deleteExamBody', { title: exam.title }),
      confirmLabel: t('exams.confirm.delete'),
      destructive: true,
    })
    if (ok) remove.mutate(exam.id, { onSuccess: () => void navigate('/admin/exams', { replace: true }) })
  }

  async function discardLocal() {
    const ok = await confirm({
      title: t('exams.confirm.discardTitle'),
      confirmLabel: t('exams.confirm.discard'),
      destructive: true,
    })
    if (!ok) return
    clearLocalDraft()
    setDraft(emptyDraft())
    setDirty(false)
    setShowRestored(false)
  }

  const keysChanged =
    answersOnly &&
    !!exam &&
    draft.questions.some((q) => q.id && exam.questions.find((o) => o.id === q.id)?.correct_option !== q.correct)

  const blockingProblems: Problem[] = [...report.exam, ...report.list]

  // ---- render ----------------------------------------------------------------
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {exam && (
        <Button asChild variant="ghost" size="sm" className="text-primary">
          <Link to={`/admin/exams/${exam.id}/manage`}>{t('exams.actions.manage')}</Link>
        </Button>
      )}
      {exam && !answersOnly && (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteExam()} disabled={activeMutation}>
          <Trash2 aria-hidden /> {t('exams.actions.delete')}
        </Button>
      )}
      {answersOnly ? (
        <Button onClick={() => void saveKeys()} disabled={!keysChanged || activeMutation}>
          {t('exams.actions.saveKeys')}
        </Button>
      ) : isPublished ? (
        <>
          <Button variant="outline" onClick={() => void unpublish()} disabled={activeMutation}>
            {t('exams.actions.unpublish')}
          </Button>
          <Button onClick={() => void save(true)} disabled={!canPublish || activeMutation}>
            <Send aria-hidden /> {t('exams.actions.saveChanges')}
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" onClick={() => void save(false)} disabled={!report.savable || activeMutation}>
            <Save aria-hidden /> {t('exams.actions.saveDraft')}
          </Button>
          <Button onClick={() => void save(true)} disabled={!canPublish || activeMutation}>
            <Send aria-hidden /> {t('exams.actions.publish')}
          </Button>
        </>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28">
      {confirmDialog}

      {/* Header: stays in view so Save / Publish are always reachable. */}
      <header className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-b bg-background px-1 py-3">
        <Button asChild variant="outline" size="icon" className="size-9" aria-label={t('common.back')}>
          <Link to="/admin/exams">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-primary sm:text-2xl">
              {isNew ? t('exams.createTitle') : t('exams.editTitle')}
            </h1>
            <StatusBadge status={exam?.status ?? 'draft'} />
            {dirty && <span className="text-xs font-semibold text-warning">{t('exams.unsaved')}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{t('exams.editorSubtitle')}</p>
        </div>
        {actions}
      </header>

      <ServerTimeBanner synced={clock.synced} now={clock.now} offset={clock.offset} />

      {exam?.reexam_of && (
        <Alert variant={exam.reexam_student_count === 0 ? 'warning' : 'default'}>
          <AlertTitle>{t('reexam.editorTitle', { title: exam.reexam_of_title ?? '' })}</AlertTitle>
          <AlertDescription>
            {t('reexam.editorBody', { count: exam.reexam_student_count })}{' '}
            <Link to={`/admin/exams/${exam.id}/manage?tab=reexams`} className="font-medium underline">
              {t('reexam.manageStudents')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {showRestored && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {t('exams.restoredDraft')}
            <Button size="sm" variant="outline" onClick={() => void discardLocal()}>
              {t('exams.confirm.discard')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {answersOnly && (
        <Alert variant="warning">
          <Lock className="mb-1 size-4" aria-hidden />
          <AlertTitle>{t('exams.locked.title', { count: exam?.attempt_count ?? 0 })}</AlertTitle>
          <AlertDescription>{t('exams.locked.body')}</AlertDescription>
        </Alert>
      )}
      {exam?.status === 'live' && !answersOnly && (
        <Alert variant="warning">
          <AlertDescription>{t('exams.liveEditWarning')}</AlertDescription>
        </Alert>
      )}

      <SectionCard
        n={1}
        id="details-h"
        title={t('exams.section1.title')}
        subtitle={t('exams.section1.subtitle')}
        aside={<Chip>{t('exams.required')}</Chip>}
      >
        <ExamDetailsForm draft={draft} onChange={change} disabled={answersOnly} />
      </SectionCard>

      <SectionCard
        n={2}
        id="questions-h"
        title={t('exams.section2.title')}
        subtitle={t('exams.section2.subtitle')}
        aside={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="primary">
              <ListChecks className="size-3.5" aria-hidden /> {t('exams.questionCount', { count: draft.questions.length })}
            </Chip>
            <Chip>{t('exams.pointsTotal', { count: totalPoints })}</Chip>
          </div>
        }
      >
        <div className="space-y-5">
          {!answersOnly && (
            <Tabs
              variant="underline"
              label={t('exams.section2.title')}
              value={tab}
              onChange={setTab}
              tabs={[
                {
                  value: 'upload',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <FileUp className="size-4" aria-hidden />
                      {t('exams.tabs.upload')}
                    </span>
                  ),
                },
                {
                  value: 'manual',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <PenLine className="size-4" aria-hidden />
                      {t('exams.tabs.manual')}
                    </span>
                  ),
                },
              ]}
            >
              {tab === 'manual' ? (
                <QuestionForm
                  editing={editing}
                  nextNumber={nextNumber}
                  onSubmit={upsertQuestion}
                  onCancelEdit={() => setEditingKey(null)}
                />
              ) : (
                <UploadQuestions
                  existingCount={draft.questions.length}
                  sourceFile={draft.sourceFile}
                  onImport={importQuestions}
                />
              )}
            </Tabs>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
                {t('exams.previewHeading', { count: draft.questions.length })}
              </h3>
              {!answersOnly && tab === 'upload' && (
                <button
                  type="button"
                  onClick={() => setTab('manual')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Plus className="size-3.5" aria-hidden /> {t('exams.addManually')}
                </button>
              )}
            </div>
            {draft.questions.length > 0 ? (
              <>
                {report.list.length > 0 && !answersOnly && (
                  <Alert variant="destructive">
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>{report.list.map((p) => t(p.key, p.values ?? {})).join(' · ')}</span>
                      <Button size="sm" variant="outline" onClick={() => setQuestions(renumber)}>
                        <ListOrdered aria-hidden /> {t('exams.actions.renumber')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <PreviewTable
                  questions={draft.questions}
                  problems={report.byQuestion}
                  editingKey={editingKey}
                  answersOnly={answersOnly}
                  onEdit={(key) => {
                    setTab('manual')
                    setEditingKey(key)
                    document.getElementById('questions-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  onDelete={(key) => void deleteQuestion(key)}
                  onMove={moveQuestion}
                  onChangeCorrect={changeCorrect}
                />
              </>
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('exams.noQuestionsYet')}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Validation bar: why Publish is disabled, save notices and server errors. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card md:left-60">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6 lg:px-8" aria-live="polite">
          <div className="min-w-0 flex-1 text-sm">
            {lastError ? (
              <div className="text-destructive">
                <p className="font-medium">{serverProblems.length ? t('exams.serverRejected') : errorMessage(lastError)}</p>
                {serverProblems.length > 0 && <p className="line-clamp-2 text-xs">{serverProblems.join(' · ')}</p>}
              </div>
            ) : (
              // A notice never hides why Publish is disabled: both are shown.
              <>
                {notice && <p className="text-success">{notice}</p>}
                {answersOnly ? (
                  !notice && <p className="text-muted-foreground">{t('exams.locked.bar')}</p>
                ) : !report.publishable ? (
                  <ProblemSummary
                    exam={blockingProblems.map((p) => t(p.key, p.values ?? {}))}
                    questionCount={report.byQuestion.size}
                  />
                ) : !clock.synced ? (
                  <p className="text-muted-foreground">{t('exams.checkingServerTime')}</p>
                ) : (
                  !notice && (
                    <p className="flex items-center gap-1.5 font-semibold text-success">
                      <CheckCircle2 className="size-4" aria-hidden /> {t('exams.readyToPublish')}
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Live server time + how far this computer's clock is off (warn at 2+ minutes). */
function ServerTimeBanner({ synced, now, offset }: { synced: boolean; now: number; offset: number }) {
  const { t } = useTranslation()
  const skewMin = Math.round(offset / 60_000)
  const off = synced && Math.abs(skewMin) >= 2
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border p-4',
        off ? 'border-warning/40 bg-gold-soft' : 'border-border bg-card card-shadow',
      )}
      role={off ? 'alert' : undefined}
    >
      <span
        aria-hidden
        className={cn('grid size-9 shrink-0 place-items-center rounded-lg', off ? 'bg-warning/15 text-warning' : 'bg-primary-soft text-primary')}
      >
        <Clock3 className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t('exams.server.label')}</span>
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-primary">
            {synced ? formatEAT(new Date(now)) : t('exams.checkingServerTime')}
          </span>
        </p>
        <p className={cn('mt-1', off ? 'text-gold-foreground' : 'text-muted-foreground')}>
          {off
            ? t(skewMin < 0 ? 'exams.clockAhead' : 'exams.clockBehind', {
                time: formatSkew(Math.abs(offset)),
                server: formatEAT(new Date(now)),
              })
            : t('exams.server.body')}
        </p>
      </div>
      {synced && (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
            off ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {off ? t('exams.server.off', { time: formatSkew(Math.abs(offset)) }) : t('exams.server.inSync')}
        </span>
      )}
    </div>
  )
}

function SectionCard({
  n,
  id,
  title,
  subtitle,
  aside,
  children,
}: {
  n: number
  id: string
  title: string
  subtitle: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card card-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:px-5">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-extrabold text-primary">
            {n}
          </span>
          <div className="min-w-0">
            <h2 id={id} className="scroll-mt-24 text-base font-extrabold text-primary">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {aside}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold',
        tone === 'primary' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function ProblemSummary({ exam, questionCount }: { exam: string[]; questionCount: number }) {
  const { t } = useTranslation()
  const parts = [...exam]
  if (questionCount > 0) parts.push(t('exams.questionsWithProblems', { count: questionCount }))
  return (
    <div className="text-muted-foreground">
      <p className="font-medium text-foreground">{t('exams.fixBeforePublish', { count: parts.length })}</p>
      <p className="line-clamp-2 text-xs">{parts.join(' · ')}</p>
    </div>
  )
}
