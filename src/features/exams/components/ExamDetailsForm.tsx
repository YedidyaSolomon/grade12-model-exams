import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ExamDraft, ExamStream } from '../types'

type Props = {
  draft: ExamDraft
  onChange: (patch: Partial<ExamDraft>) => void
  disabled?: boolean
}

const STREAMS: ExamStream[] = ['both', 'natural', 'social']
const label = 'text-[0.6875rem] font-bold tracking-wide text-muted-foreground uppercase'

/** Section 1 fields: title, subject, stream (segmented), duration, window (EAT). */
export function ExamDetailsForm({ draft, onChange, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <fieldset disabled={disabled} className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="exam-title" className={label}>
          {t('exams.fields.title')}
        </Label>
        <Input
          id="exam-title"
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={200}
          placeholder={t('exams.fields.titlePlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-subject" className={label}>
          {t('exams.fields.subject')}
        </Label>
        <Input
          id="exam-subject"
          value={draft.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          maxLength={80}
          placeholder={t('exams.fields.subjectPlaceholder')}
        />
      </div>

      <div className="space-y-1.5">
        <span id="exam-stream-label" className={cn(label, 'block')}>
          {t('exams.fields.stream')}
        </span>
        {/* Segmented toggle built from real radio buttons (keyboard + screen readers work). */}
        <div role="radiogroup" aria-labelledby="exam-stream-label" className="grid h-10 grid-cols-3 gap-1 rounded-lg border bg-muted p-1">
          {STREAMS.map((s) => (
            <label
              key={s}
              className={cn(
                'grid cursor-pointer place-items-center rounded-md text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                draft.stream === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-primary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name="exam-stream"
                value={s}
                checked={draft.stream === s}
                onChange={() => onChange({ stream: s })}
                className="sr-only"
              />
              {t(`exams.streamShort.${s}`)}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-duration" className={label}>
          {t('exams.fields.duration')}
        </Label>
        <div className="relative">
          <Input
            id="exam-duration"
            inputMode="numeric"
            value={draft.duration}
            onChange={(e) => onChange({ duration: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            className="pr-20"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {t('exams.fields.minutesSuffix')}
          </span>
        </div>
      </div>
      <div className="hidden lg:block" />

      <div className="space-y-1.5 lg:col-span-1">
        <Label htmlFor="exam-start" className={label}>
          {t('exams.fields.windowStart')}
        </Label>
        <Input
          id="exam-start"
          type="datetime-local"
          value={draft.windowStart}
          onChange={(e) => onChange({ windowStart: e.target.value })}
          aria-describedby="exam-window-hint"
        />
      </div>
      <div className="space-y-1.5 lg:col-span-1">
        <Label htmlFor="exam-end" className={label}>
          {t('exams.fields.windowEnd')}
        </Label>
        <Input
          id="exam-end"
          type="datetime-local"
          value={draft.windowEnd}
          onChange={(e) => onChange({ windowEnd: e.target.value })}
          aria-describedby="exam-window-hint"
        />
      </div>
      <p id="exam-window-hint" className="flex items-start gap-1.5 self-end pb-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
        <CalendarClock className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
        {t('exams.fields.windowHint')}
      </p>
    </fieldset>
  )
}
