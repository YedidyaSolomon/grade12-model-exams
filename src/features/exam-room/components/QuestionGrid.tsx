import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AnswerState, AttemptPayload } from '../types'

type Props = {
  questions: AttemptPayload['questions']
  answers: Map<string, AnswerState>
  current: number
  onJump: (index: number) => void
}

export function QuestionGrid({ questions, answers, current, onJump }: Props) {
  const { t } = useTranslation()
  const answered = questions.filter((q) => answers.get(q.id)?.option).length
  const flagged = questions.filter((q) => answers.get(q.id)?.flagged).length

  return (
    <nav aria-label={t('room.gridLabel')} className="space-y-3">
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-primary" aria-hidden /> {t('room.legendAnswered', { count: answered })}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border-2 bg-card" aria-hidden />{' '}
          {t('room.legendUnanswered', { count: questions.length - answered })}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-warning" aria-hidden /> {t('room.legendFlagged', { count: flagged })}
        </li>
      </ul>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
        {questions.map((q, i) => {
          const a = answers.get(q.id)
          const isAnswered = !!a?.option
          const isFlagged = !!a?.flagged
          const state = [
            isAnswered ? t('room.stateAnswered') : t('room.stateUnanswered'),
            isFlagged ? t('room.stateFlagged') : null,
          ]
            .filter(Boolean)
            .join(', ')
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={i === current ? 'step' : undefined}
                aria-label={t('room.jumpTo', { number: i + 1, state })}
                className={cn(
                  'relative flex h-11 w-full items-center justify-center rounded-md border-2 text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isAnswered ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                  i === current && 'ring-2 ring-foreground ring-offset-2',
                )}
              >
                {i + 1}
                {isFlagged && (
                  <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-card bg-warning" aria-hidden />
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
