import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Clock, ListChecks, Repeat, Save, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ErrorState, Loading } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { safeStorage } from '@/lib/storage'
import { formatEAT } from '@/lib/time'
import { payloadKey, roomKeys, startExam, studentErrorCode, useStudentDashboard } from '@/features/exam-room/api'
import { useServerNow } from '@/features/exam-room/useServerClock'
import { ExamStateMessage, availability } from '@/features/exam-room/components/ExamStateMessage'
import type { DashboardExam } from '@/features/exam-room/types'

export default function RulesPage() {
  const { examId = '' } = useParams()
  const { t } = useTranslation()
  const dash = useStudentDashboard()

  if (dash.isPending) return <Loading fullScreen />
  if (dash.isError) return <ErrorState fullScreen message={errorMessage(dash.error)} onRetry={() => void dash.refetch()} />
  if (dash.data.banned) return <Navigate to="/suspended" replace />
  const exam = dash.data.exams.find((e) => e.id === examId)
  if (!exam) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="font-medium">{t('rules.notAvailable')}</p>
        <Button asChild variant="outline">
          <Link to="/">{t('rules.backToDashboard')}</Link>
        </Button>
      </main>
    )
  }
  return <Rules exam={exam} offset={dash.data.offset} />
}

function Rules({ exam, offset }: { exam: DashboardExam; offset: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useServerNow(offset)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const av = availability(exam, now)

  if (av.kind === 'resume') return <Navigate to={`/exam/${exam.id}/room`} replace />

  // Effective time: the window may close before the full duration is up.
  const windowLeftMs = exam.live_ends_at ? new Date(exam.live_ends_at).getTime() - now : 0
  const effectiveMin = Math.max(0, Math.min(exam.duration_minutes, Math.floor(windowLeftMs / 60_000)))
  const shortened = av.kind === 'start' && effectiveMin < exam.duration_minutes

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const payload = await startExam(exam.id)
      safeStorage.set(payloadKey(exam.id), payload)
      queryClient.setQueryData(roomKeys.attempt(exam.id), payload)
      void queryClient.invalidateQueries({ queryKey: roomKeys.dashboard })
      void navigate(`/exam/${exam.id}/room`, { replace: true })
    } catch (e) {
      const code = studentErrorCode(e)
      if (code === 'banned') {
        void navigate('/suspended', { replace: true })
        return
      }
      setError(code ? t(`errors.${code}`) : errorMessage(e))
      setStarting(false)
      void queryClient.invalidateQueries({ queryKey: roomKeys.dashboard })
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">
          <ArrowLeft aria-hidden /> {t('rules.backToDashboard')}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">{exam.subject}</p>
          <CardTitle className="text-xl">{exam.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {av.kind !== 'start' ? (
            <ExamStateMessage exam={exam} av={av} nowMs={now} />
          ) : (
            <>
              <ul className="space-y-3 text-sm">
                <Rule icon={<ListChecks aria-hidden />}>{t('rules.questions', { count: exam.question_count })}</Rule>
                <Rule icon={<Clock aria-hidden />}>
                  {t('rules.duration', { count: exam.duration_minutes })}
                  {exam.live_ends_at && (
                    <span className="block text-xs text-muted-foreground">
                      {t('rules.windowCloses', { time: formatEAT(exam.live_ends_at) })}
                    </span>
                  )}
                </Rule>
                <Rule icon={<Repeat aria-hidden />}>
                  <strong>{av.retake ? t('rules.retake') : t('rules.oneAttempt')}</strong>
                </Rule>
                <Rule icon={<Save aria-hidden />}>{t('rules.autosave')}</Rule>
                <Rule icon={<CheckCircle2 aria-hidden />}>{t('rules.autoSubmit')}</Rule>
              </ul>

              {shortened && (
                <Alert variant="warning">
                  <TriangleAlert className="mb-1 size-4" aria-hidden />
                  <AlertDescription>{t('rules.shortened', { count: effectiveMin })}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button size="lg" className="w-full" onClick={() => void start()} disabled={starting}>
                {starting ? t('rules.starting') : t('rules.start')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-primary [&_svg]:size-5">{icon}</span>
      <span>{children}</span>
    </li>
  )
}
