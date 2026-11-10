import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { ExamDraft, ExamStream } from '../types'

type Props = {
  draft: ExamDraft
  onChange: (patch: Partial<ExamDraft>) => void
  disabled?: boolean
}

export function ExamDetailsForm({ draft, onChange, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
        <Label htmlFor="exam-title">{t('exams.fields.title')}</Label>
        <Input
          id="exam-title"
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={200}
          placeholder={t('exams.fields.titlePlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-subject">{t('exams.fields.subject')}</Label>
        <Input
          id="exam-subject"
          value={draft.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          maxLength={80}
          placeholder={t('exams.fields.subjectPlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-stream">{t('exams.fields.stream')}</Label>
        <NativeSelect
          id="exam-stream"
          value={draft.stream}
          onChange={(e) => onChange({ stream: e.target.value as ExamStream })}
        >
          <option value="both">{t('exams.stream.both')}</option>
          <option value="natural">{t('exams.stream.natural')}</option>
          <option value="social">{t('exams.stream.social')}</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-duration">{t('exams.fields.duration')}</Label>
        <Input
          id="exam-duration"
          inputMode="numeric"
          value={draft.duration}
          onChange={(e) => onChange({ duration: e.target.value.replace(/\D/g, '').slice(0, 3) })}
        />
      </div>
      <div className="hidden lg:block" />
      <div className="space-y-1.5">
        <Label htmlFor="exam-start">{t('exams.fields.windowStart')}</Label>
        <Input
          id="exam-start"
          type="datetime-local"
          value={draft.windowStart}
          onChange={(e) => onChange({ windowStart: e.target.value })}
          aria-describedby="exam-window-hint"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exam-end">{t('exams.fields.windowEnd')}</Label>
        <Input
          id="exam-end"
          type="datetime-local"
          value={draft.windowEnd}
          onChange={(e) => onChange({ windowEnd: e.target.value })}
          aria-describedby="exam-window-hint"
        />
      </div>
      <p id="exam-window-hint" className="self-end pb-2 text-xs text-muted-foreground">
        {t('exams.fields.windowHint')}
      </p>
    </fieldset>
  )
}
