import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { studentErrorCode, useRequestReexam } from '../api'
import { REEXAM_REASONS, type DashboardExam, type ReexamReason } from '../types'

const MIN = 5
const MAX = 1000

/**
 * Re-exam request form. Laptop: a panel beside the exam list. Phone: a full-screen sheet.
 * Eligibility is checked again by request_reexam() in Postgres; `exams` only lists the
 * ones the dashboard says are requestable.
 */
export function ReexamRequestForm({
  exams,
  examId,
  onExamChange,
  onClose,
  onSent,
}: {
  exams: DashboardExam[]
  examId: string
  onExamChange: (id: string) => void
  onClose: () => void
  onSent: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const request = useRequestReexam()
  const [category, setCategory] = useState<ReexamReason | ''>('')
  const [reason, setReason] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus the sheet when it opens; Escape closes it; no page scroll behind it on phones.
  useEffect(() => {
    headingRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const phone = window.matchMedia('(max-width: 1023px)').matches
    const prev = document.body.style.overflow
    if (phone) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const trimmed = reason.trim().length
  const valid = !!category && trimmed >= MIN && trimmed <= MAX && !!examId

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !category) return
    request.mutate(
      { examId, reason: reason.trim(), category },
      {
        onSuccess: () => {
          setReason('')
          setCategory('')
          onSent()
        },
      },
    )
  }

  const code = request.isError ? studentErrorCode(request.error) : null

  return (
    <section
      role="dialog"
      aria-labelledby={`${id}-title`}
      className={cn(
        // Phone: full-screen sheet. Laptop: sticky panel in the right column.
        'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background',
        'lg:sticky lg:z-auto lg:top-24 lg:self-start lg:overflow-visible lg:rounded-xl lg:border lg:bg-card lg:card-shadow',
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-4 py-3 lg:static lg:rounded-t-xl lg:border-b-0 lg:pb-0">
        <div>
          <span className="rounded-md bg-gold-soft px-2 py-0.5 text-[0.6875rem] font-bold tracking-wide text-gold-foreground uppercase">
            {t('reexamRequest.pill')}
          </span>
          <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="mt-1.5 text-lg font-extrabold text-primary outline-none">
            {t('reexamRequest.formTitle')}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('reexamRequest.close')}>
          <X aria-hidden />
        </Button>
      </div>

      <form onSubmit={onSubmit} className="flex-1 space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{t('reexamRequest.body')}</p>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-exam`}>{t('reexamRequest.exam')}</Label>
          <NativeSelect id={`${id}-exam`} value={examId} onChange={(e) => onExamChange(e.target.value)} required>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.subject})
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-cat`}>{t('reexamRequest.category')}</Label>
          <NativeSelect
            id={`${id}-cat`}
            value={category}
            onChange={(e) => setCategory(e.target.value as ReexamReason)}
            required
          >
            <option value="" disabled>
              {t('reexamRequest.categoryPlaceholder')}
            </option>
            {REEXAM_REASONS.map((c) => (
              <option key={c} value={c}>
                {t(`reexamRequest.categories.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>{t('reexamRequest.details')}</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reexamRequest.placeholder')}
            minLength={MIN}
            maxLength={MAX}
            rows={5}
            required
            aria-describedby={`${id}-count`}
          />
          <p id={`${id}-count`} className="text-right text-xs text-muted-foreground tabular-nums">
            {t('reexamRequest.count', { count: reason.length, max: MAX })}
          </p>
        </div>

        {request.isError && (
          <p role="alert" className="text-sm text-destructive">
            {code ? t(`errors.${code}`) : errorMessage(request.error)}
          </p>
        )}

        <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button type="submit" variant="press" size="lg" className="w-full" disabled={!valid || request.isPending}>
            <Send aria-hidden />
            {request.isPending ? t('reexamRequest.sending') : t('reexamRequest.send')}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </section>
  )
}
