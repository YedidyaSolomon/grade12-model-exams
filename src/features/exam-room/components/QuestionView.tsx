import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LETTERS, type AnswerState, type AttemptPayload, type OptionLetter } from '../types'

type Props = {
  question: AttemptPayload['questions'][number]
  number: number
  total: number
  answer: AnswerState | undefined
  disabled: boolean
  onSelect: (letter: OptionLetter) => void
  onToggleFlag: () => void
}

export function QuestionView({ question, number, total, answer, disabled, onSelect, onToggleFlag }: Props) {
  const { t } = useTranslation()
  const groupName = `q-${question.id}`
  const flagged = answer?.flagged ?? false

  return (
    <article aria-labelledby={`${groupName}-label`} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {t('room.questionOf', { number, total })}
          {question.points > 1 && <span> · {t('room.points', { count: question.points })}</span>}
        </p>
        <button
          type="button"
          onClick={onToggleFlag}
          disabled={disabled}
          aria-pressed={flagged}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            flagged ? 'border-warning bg-warning/20' : 'border-border bg-card text-muted-foreground',
          )}
        >
          <Flag className={cn('size-4', flagged && 'fill-current')} aria-hidden />
          {flagged ? t('room.flagged') : t('room.flag')}
        </button>
      </div>

      <h2 id={`${groupName}-label`} className="text-lg leading-relaxed font-medium whitespace-pre-wrap">
        {question.body}
      </h2>
      {question.image_url && (
        <img
          src={question.image_url}
          alt={t('room.questionImage', { number })}
          className="max-h-72 w-auto rounded-lg border object-contain"
          loading="lazy"
          decoding="async"
        />
      )}

      <div role="radiogroup" aria-labelledby={`${groupName}-label`} className="space-y-2.5">
        {question.options.map((text, i) => {
          const letter = LETTERS[i] ?? 'A'
          const selected = answer?.option === letter
          return (
            // The whole row is the label: tapping anywhere selects.
            <label
              key={letter}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'border-primary bg-primary/10' : 'border-border bg-card active:bg-accent',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={letter}
                checked={selected}
                disabled={disabled}
                onChange={() => onSelect(letter)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                )}
              >
                {letter}
              </span>
              <span className="text-base leading-snug">{text}</span>
            </label>
          )
        })}
      </div>
    </article>
  )
}
