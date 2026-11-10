import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { uploadQuestionImage } from '../api'
import { questionProblems } from '../validation'
import { OPTION_LETTERS, emptyQuestion, type DraftQuestion } from '../types'

type Props = {
  /** question being edited, or null to add a new one */
  editing: DraftQuestion | null
  nextNumber: number
  onSubmit: (q: DraftQuestion) => void
  onCancelEdit: () => void
}

export function QuestionForm({ editing, nextNumber, onSubmit, onCancelEdit }: Props) {
  const { t } = useTranslation()
  const [q, setQ] = useState<DraftQuestion>(() => editing ?? emptyQuestion(nextNumber))
  const [showProblems, setShowProblems] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Load the selected question (or reset to a blank one) when the edit target changes.
  useEffect(() => {
    setQ(editing ? { ...editing, options: padOptions(editing.options) } : emptyQuestion(nextNumber))
    setShowProblems(false)
    setUploadError(null)
    if (editing) bodyRef.current?.focus()
    // nextNumber intentionally excluded: only reset when the edit target changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.key])

  const problems = questionProblems(q)

  function setOption(i: number, value: string) {
    setQ((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? value : o)) }))
  }

  async function onImage(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadQuestionImage(file)
      setQ((prev) => ({ ...prev, image_url: url }))
    } catch (e) {
      setUploadError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (problems.length) {
      setShowProblems(true)
      return
    }
    onSubmit({ ...q, body: q.body.trim(), options: q.options.map((o) => o.trim()) })
    if (!editing) {
      setQ(emptyQuestion(nextNumber + 1))
      setShowProblems(false)
      bodyRef.current?.focus()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4" noValidate>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {editing
            ? t('exams.form.editTitle', { number: editing.number })
            : t('exams.form.addTitle', { number: nextNumber })}
        </h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="q-points" className="text-xs text-muted-foreground">
            {t('exams.form.points')}
          </Label>
          <Input
            id="q-points"
            inputMode="numeric"
            className="h-9 w-16"
            value={Number.isNaN(q.points) ? '' : String(q.points)}
            onChange={(e) => setQ({ ...q, points: parseInt(e.target.value.replace(/\D/g, '') || 'NaN', 10) })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-body">{t('exams.form.question')}</Label>
        <Textarea
          id="q-body"
          ref={bodyRef}
          rows={3}
          value={q.body}
          onChange={(e) => setQ({ ...q, body: e.target.value })}
          aria-invalid={showProblems && !q.body.trim()}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t('exams.form.optionsLegend')}</legend>
        {OPTION_LETTERS.map((letter, i) => {
          const isCorrect = q.correct === letter
          return (
            <div
              key={letter}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-1.5 pl-2',
                isCorrect ? 'border-success bg-success/5' : 'border-transparent',
              )}
            >
              <input
                type="radio"
                name="q-correct"
                id={`q-correct-${letter}`}
                checked={isCorrect}
                onChange={() => setQ({ ...q, correct: letter })}
                className="size-4 accent-[var(--success)]"
                aria-label={t('exams.form.markCorrect', { letter })}
              />
              <Label htmlFor={`q-opt-${letter}`} className="w-5 font-semibold">
                {letter}
              </Label>
              <Input
                id={`q-opt-${letter}`}
                value={q.options[i] ?? ''}
                onChange={(e) => setOption(i, e.target.value)}
                aria-invalid={showProblems && !(q.options[i] ?? '').trim()}
                className="h-9"
              />
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">{t('exams.form.correctHint')}</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {q.image_url ? (
          <div className="relative">
            <img src={q.image_url} alt="" className="h-20 rounded border object-contain" loading="lazy" />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute -top-2 -right-2 size-6 rounded-full"
              onClick={() => setQ({ ...q, image_url: null })}
              aria-label={t('exams.form.removeImage')}
            >
              <X />
            </Button>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {uploading ? t('exams.form.uploading') : t('exams.form.addImage')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void onImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      </div>

      {showProblems && problems.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-inside list-disc">
              {problems.map((p) => (
                <li key={p.key}>{t(p.key, p.values ?? {})}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={uploading}>
          {editing ? t('exams.form.update') : t('exams.form.add')}
        </Button>
        {editing && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}

function padOptions(options: string[]): string[] {
  const out = options.slice(0, 4)
  while (out.length < 4) out.push('')
  return out
}
