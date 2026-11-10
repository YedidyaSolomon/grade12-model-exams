import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, FileUp, ListOrdered, Lock, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs } from '@/components/ui/tabs'
import { ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage, rpcProblems } from '@/lib/errors'
import { formatDuration, formatEAT, eatInputToIso } from '@/lib/time'
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
import { StatusBadge } from '@/features/exams/components/StatusBadge'

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
  const [tab, setTab] = useState<'manual' | 'upload'>('manual')
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
  const clockSkewMin = Math.round(clock.offset / 60_000)
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
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {confirmDialog}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/admin/exams">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{isNew ? t('exams.createTitle') : t('exams.editTitle')}</h1>
        {exam && <StatusBadge status={exam.status} />}
        {dirty && <span className="text-xs text-muted-foreground">{t('exams.unsaved')}</span>}
        {exam && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to={`/admin/exams/${exam.id}/manage`}>{t('exams.actions.manage')}</Link>
          </Button>
        )}
      </div>

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
      {clock.synced && Math.abs(clockSkewMin) >= 2 && (
        <Alert variant="warning">
          <AlertDescription>
            {t(clockSkewMin < 0 ? 'exams.clockAhead' : 'exams.clockBehind', {
              time: formatDuration(Math.abs(clock.offset)),
              server: formatEAT(new Date(clock.now)),
            })}
          </AlertDescription>
        </Alert>
      )}
      {exam?.status === 'live' && !answersOnly && (
        <Alert variant="warning">
          <AlertDescription>{t('exams.liveEditWarning')}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="details-h" className="space-y-3">
        <h2 id="details-h" className="text-lg font-semibold">{t('exams.detailsHeading')}</h2>
        <ExamDetailsForm draft={draft} onChange={change} disabled={answersOnly} />
      </section>

      <section aria-labelledby="questions-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="questions-h" className="text-lg font-semibold">
            {t('exams.questionsHeading')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('exams.summary', { count: draft.questions.length, points: totalPoints })}
          </p>
        </div>

        {!answersOnly && (
          <Tabs
            label={t('exams.questionsHeading')}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'manual', label: <span className="flex items-center gap-1.5"><PenLine className="size-4" aria-hidden />{t('exams.tabs.manual')}</span> },
              { value: 'upload', label: <span className="flex items-center gap-1.5"><FileUp className="size-4" aria-hidden />{t('exams.tabs.upload')}</span> },
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
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t('exams.tabs.uploadSoon')}
              </div>
            )}
          </Tabs>
        )}

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
                window.scrollTo({ top: 0, behavior: 'smooth' })
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
      </section>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur md:left-56">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {lastError ? (
              <div className="text-destructive">
                <p className="font-medium">{serverProblems.length ? t('exams.serverRejected') : errorMessage(lastError)}</p>
                {serverProblems.length > 0 && <p className="line-clamp-2 text-xs">{serverProblems.join(' · ')}</p>}
              </div>
            ) : (
              // A notice never hides why Publish is disabled: both are shown.
              <>
                {notice && <p className="text-success">{notice}</p>}
                {answersOnly ? null : !report.publishable ? (
                  <ProblemSummary
                    exam={blockingProblems.map((p) => t(p.key, p.values ?? {}))}
                    questionCount={report.byQuestion.size}
                  />
                ) : !clock.synced ? (
                  <p className="text-muted-foreground">{t('exams.checkingServerTime')}</p>
                ) : (
                  !notice && <p className="text-success">{t('exams.readyToPublish')}</p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {exam && !answersOnly && (
              <Button variant="ghost" className="text-destructive" onClick={() => void deleteExam()} disabled={activeMutation}>
                {t('exams.actions.delete')}
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
                  {t('exams.actions.saveChanges')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => void save(false)} disabled={!report.savable || activeMutation}>
                  {t('exams.actions.saveDraft')}
                </Button>
                <Button onClick={() => void save(true)} disabled={!canPublish || activeMutation}>
                  {t('exams.actions.publish')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
