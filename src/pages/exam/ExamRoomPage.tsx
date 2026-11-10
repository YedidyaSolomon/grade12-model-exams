import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CloudOff, LayoutGrid, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ErrorState, Loading } from '@/components/states'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage } from '@/lib/errors'
import { safeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import {
  getOpenAttempt,
  isNetworkError,
  payloadKey,
  roomKeys,
  studentErrorCode,
  submitExam,
  type TimedPayload,
} from '@/features/exam-room/api'
import { readQueue, useAnswerSync } from '@/features/exam-room/useAnswerSync'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { Timer } from '@/features/exam-room/components/Timer'
import { QuestionView } from '@/features/exam-room/components/QuestionView'
import { QuestionGrid } from '@/features/exam-room/components/QuestionGrid'
import { SaveIndicator } from '@/features/exam-room/components/SaveIndicator'
import { LETTERS, type AnswerState, type OptionLetter, type StudentErrorCode } from '@/features/exam-room/types'

const indexKey = (attemptId: string) => `exam-index:${attemptId}`

export default function ExamRoomPage() {
  const { examId = '' } = useParams()

  // Resume only — this page never creates an attempt (the rules page does).
  const attempt = useQuery({
    queryKey: roomKeys.attempt(examId),
    queryFn: async (): Promise<TimedPayload | null> => {
      try {
        const p = await getOpenAttempt(examId)
        if (p) safeStorage.set(payloadKey(examId), p)
        else safeStorage.remove(payloadKey(examId))
        return p
      } catch (e) {
        // Offline reload / phone restart: continue from the copy saved on the device.
        const cached = safeStorage.get<TimedPayload>(payloadKey(examId))
        // Compare on the server's clock (offset saved with the payload), not the phone's.
        const serverNow = Date.now() + (cached?.offset ?? 0)
        if (isNetworkError(e) && cached && new Date(cached.deadline_at).getTime() > serverNow - 60_000) {
          return cached
        }
        throw e
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnReconnect: false,
  })

  if (attempt.isPending) return <Loading fullScreen />
  if (attempt.isError) {
    if (studentErrorCode(attempt.error) === 'banned') return <Navigate to="/suspended" replace />
    return <ErrorState fullScreen message={errorMessage(attempt.error)} onRetry={() => void attempt.refetch()} />
  }
  if (!attempt.data) return <Navigate to={`/exam/${examId}`} replace />
  return <Room key={attempt.data.attempt_id} payload={attempt.data} />
}

// ---------------------------------------------------------------------------

type Phase = 'answering' | 'submitting' | 'retrying'

function Room({ payload }: { payload: TimedPayload }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirm, confirmDialog] = useConfirm()
  const questions = payload.questions
  const total = questions.length

  // Server answers, overlaid with anything still queued on this device.
  const [answers, setAnswers] = useState<Map<string, AnswerState>>(() => {
    const m = new Map<string, AnswerState>()
    for (const a of payload.answers) m.set(a.question_id, { option: a.selected_option, flagged: a.flagged })
    for (const q of Object.values(readQueue(payload.attempt_id)))
      m.set(q.question_id, { option: q.selected_option, flagged: q.flagged })
    return m
  })
  const [index, setIndex] = useState(() => {
    const saved = safeStorage.get<number>(indexKey(payload.attempt_id))
    if (saved != null && saved >= 0 && saved < total) return saved
    const firstUnanswered = questions.findIndex((q) => !answers.get(q.id)?.option)
    return firstUnanswered === -1 ? 0 : firstUnanswered
  })
  const [gridOpen, setGridOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('answering')
  const [timeUp, setTimeUp] = useState(false)
  const submittingRef = useRef(false)

  const now = useServerNow(payload.offset)
  const remaining = new Date(payload.deadline_at).getTime() - now

  // ---- submit -----------------------------------------------------------------
  const submitRef = useRef<(auto: boolean) => Promise<void>>(async () => {})

  const onClosed = useCallback((code: StudentErrorCode) => {
    if (code === 'banned') void navigate('/suspended', { replace: true })
    else void submitRef.current(true) // time_up / already_submitted: finalise and leave
  }, [navigate])

  const sync = useAnswerSync(payload.attempt_id, onClosed)

  submitRef.current = async (auto: boolean) => {
    if (submittingRef.current) return
    submittingRef.current = true
    if (auto) setTimeUp(true)
    setPhase('submitting')
    for (;;) {
      try {
        const res = await submitExam(payload.attempt_id, sync.pending())
        sync.clear()
        safeStorage.remove(payloadKey(payload.exam_id))
        safeStorage.remove(indexKey(payload.attempt_id))
        queryClient.removeQueries({ queryKey: roomKeys.attempt(payload.exam_id) })
        void queryClient.invalidateQueries({ queryKey: roomKeys.dashboard })
        void navigate(`/exam/${payload.exam_id}/result`, {
          replace: true,
          state: { justSubmitted: true, auto: auto || res.auto_submitted, late: res.late },
        })
        return
      } catch (e) {
        const code = studentErrorCode(e)
        if (code === 'banned') {
          void navigate('/suspended', { replace: true })
          return
        }
        if (!isNetworkError(e) && code !== null) {
          // Attempt no longer exists for us; go back to the dashboard.
          void navigate('/', { replace: true })
          return
        }
        // Offline: keep trying. Answers stay safe in the local queue meanwhile.
        setPhase('retrying')
        await new Promise((r) => window.setTimeout(r, navigator.onLine ? 3000 : 5000))
      }
    }
  }

  // Time-out: submit automatically (the server applies the same deadline + grace).
  useEffect(() => {
    if (remaining <= 0 && !submittingRef.current) void submitRef.current(true)
  }, [remaining])

  // ---- answering ----------------------------------------------------------------
  const answering = phase === 'answering'
  const current = questions[index]

  const select = useCallback(
    (letter: OptionLetter) => {
      if (!current || !answering) return
      const prev = answers.get(current.id)
      const next = { option: letter, flagged: prev?.flagged ?? false }
      setAnswers((m) => new Map(m).set(current.id, next))
      sync.record({ question_id: current.id, selected_option: next.option, flagged: next.flagged })
    },
    [answering, answers, current, sync],
  )

  const toggleFlag = useCallback(() => {
    if (!current || !answering) return
    const prev = answers.get(current.id)
    const next = { option: prev?.option ?? null, flagged: !(prev?.flagged ?? false) }
    setAnswers((m) => new Map(m).set(current.id, next))
    sync.record({ question_id: current.id, selected_option: next.option, flagged: next.flagged })
  }, [answering, answers, current, sync])

  const go = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(total - 1, i))
      setIndex(clamped)
      safeStorage.set(indexKey(payload.attempt_id), clamped)
      setGridOpen(false)
      window.scrollTo({ top: 0 })
    },
    [payload.attempt_id, total],
  )

  // Keyboard: ←/→ previous/next, A–D or 1–4 select, F flag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('dialog') || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'radio') return
      const k = e.key.toLowerCase()
      if (k === 'arrowright' && target.getAttribute('type') !== 'radio') go(index + 1)
      else if (k === 'arrowleft' && target.getAttribute('type') !== 'radio') go(index - 1)
      else if (k === 'f') toggleFlag()
      else {
        const i = ['a', 'b', 'c', 'd'].indexOf(k) !== -1 ? ['a', 'b', 'c', 'd'].indexOf(k) : ['1', '2', '3', '4'].indexOf(k)
        const letter = LETTERS[i]
        if (i !== -1 && letter && current && i < current.options.length) select(letter)
        else return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, go, index, select, toggleFlag])

  // Warn before leaving mid-exam (answers are safe, but the clock keeps running).
  useEffect(() => {
    if (!answering) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [answering])

  const unanswered = useMemo(() => questions.filter((q) => !answers.get(q.id)?.option).length, [answers, questions])
  const flaggedCount = useMemo(() => questions.filter((q) => answers.get(q.id)?.flagged).length, [answers, questions])

  async function confirmSubmit() {
    const ok = await confirm({
      title: t('room.submitTitle'),
      description: (
        <div className="space-y-1">
          {unanswered > 0 ? (
            <p className="font-medium text-destructive">{t('room.submitUnanswered', { count: unanswered })}</p>
          ) : (
            <p>{t('room.submitAllAnswered')}</p>
          )}
          {flaggedCount > 0 && <p>{t('room.submitFlagged', { count: flaggedCount })}</p>}
          <p>{t('room.submitFinal')}</p>
        </div>
      ),
      confirmLabel: t('room.submit'),
    })
    if (ok) void submitRef.current(false)
  }

  // ---- render ------------------------------------------------------------------
  if (phase !== 'answering') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" aria-live="assertive">
        {phase === 'retrying' ? <CloudOff className="size-10 text-warning" aria-hidden /> : <Loader2 className="size-10 animate-spin text-primary" aria-hidden />}
        <h1 className="text-xl font-semibold">{timeUp ? t('room.timeUpTitle') : t('room.submittingTitle')}</h1>
        <p className="max-w-sm text-muted-foreground">
          {phase === 'retrying' ? t('room.submitRetrying') : timeUp ? t('room.timeUpBody') : t('room.submittingBody')}
        </p>
      </main>
    )
  }

  if (!current) return <ErrorState fullScreen message={t('room.noQuestions')} />

  return (
    <div className="min-h-dvh pb-24">
      {confirmDialog}

      {/* Sticky header: title, timer, save status */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{payload.title}</p>
            <SaveIndicator status={sync.status} />
          </div>
          <Timer remainingMs={remaining} />
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setGridOpen((o) => !o)}
            aria-expanded={gridOpen}
            aria-controls="question-grid"
          >
            <LayoutGrid aria-hidden />
            <span className="tabular-nums">
              {total - unanswered}/{total}
            </span>
          </Button>
        </div>
        {sync.status === 'offline' && (
          <div className="bg-warning/20 px-3 py-1.5 text-center text-sm font-medium" role="status">
            {t('room.offlineBanner')}
          </div>
        )}
        {gridOpen && (
          <div id="question-grid" className="max-h-[60dvh] overflow-y-auto border-t p-3 lg:hidden">
            <QuestionGrid questions={questions} answers={answers} current={index} onJump={go} />
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 pt-5">
        <main className="min-w-0 flex-1">
          <QuestionView
            question={current}
            number={index + 1}
            total={total}
            answer={answers.get(current.id)}
            disabled={!answering}
            onSelect={select}
            onToggleFlag={toggleFlag}
          />
        </main>
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4 rounded-xl border bg-card p-4">
            <QuestionGrid questions={questions} answers={answers} current={index} onJump={go} />
            <Button className="w-full" onClick={() => void confirmSubmit()}>
              <Send aria-hidden /> {t('room.submit')}
            </Button>
          </div>
        </aside>
      </div>

      {/* Bottom navigation */}
      <nav
        aria-label={t('room.navLabel')}
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => go(index - 1)} disabled={index === 0}>
            <ChevronLeft aria-hidden /> {t('room.previous')}
          </Button>
          {index < total - 1 ? (
            <Button size="lg" className="flex-1" onClick={() => go(index + 1)}>
              {t('room.next')} <ChevronRight aria-hidden />
            </Button>
          ) : (
            <Button size="lg" className={cn('flex-1', 'bg-success hover:bg-success/90')} onClick={() => void confirmSubmit()}>
              <Send aria-hidden /> {t('room.submit')}
            </Button>
          )}
        </div>
      </nav>

      {remaining <= 5 * 60_000 && remaining > 0 && unanswered > 0 && (
        <div className="mx-auto mt-6 max-w-5xl px-4">
          <Alert variant="warning">
            <AlertDescription>{t('room.lowTimeUnanswered', { count: unanswered })}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}
