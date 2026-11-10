import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import type { Problem } from '../validation'
import { OPTION_LETTERS, type DraftQuestion, type OptionLetter } from '../types'

type Props = {
  questions: DraftQuestion[]
  problems: Map<string, Problem[]>
  editingKey: string | null
  /** Exam has attempts: only the answer column is editable. */
  answersOnly: boolean
  onEdit: (key: string) => void
  onDelete: (key: string) => void
  onMove: (key: string, dir: -1 | 1) => void
  onChangeCorrect: (key: string, letter: OptionLetter) => void
}

export function PreviewTable({
  questions,
  problems,
  editingKey,
  answersOnly,
  onEdit,
  onDelete,
  onMove,
  onChangeCorrect,
}: Props) {
  const { t } = useTranslation()
  const sorted = [...questions].sort((a, b) => a.number - b.number)

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">{t('exams.preview.caption')}</caption>
        <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 px-3 py-2">#</th>
            <th scope="col" className="px-3 py-2">{t('exams.preview.question')}</th>
            <th scope="col" className="px-3 py-2">{t('exams.preview.options')}</th>
            <th scope="col" className="w-24 px-3 py-2">{t('exams.preview.answer')}</th>
            <th scope="col" className="w-16 px-3 py-2">{t('exams.preview.points')}</th>
            <th scope="col" className="w-40 px-3 py-2">{t('exams.preview.problems')}</th>
            {!answersOnly && <th scope="col" className="w-36 px-3 py-2 text-right">{t('exams.preview.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((q, i) => {
            const qp = problems.get(q.key) ?? []
            return (
              <tr
                key={q.key}
                className={cn(
                  'border-b align-top last:border-0',
                  qp.length > 0 && 'bg-destructive/5',
                  editingKey === q.key && 'outline-2 -outline-offset-2 outline-primary',
                )}
              >
                <td className="px-3 py-2 font-medium tabular-nums">{q.number}</td>
                <td className="max-w-xs px-3 py-2">
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {q.body || <span className="text-muted-foreground italic">{t('exams.preview.empty')}</span>}
                  </p>
                  {q.image_url && (
                    <img src={q.image_url} alt="" className="mt-1 h-12 rounded border object-contain" loading="lazy" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <ol className="space-y-0.5">
                    {q.options.map((o, j) => {
                      const letter = OPTION_LETTERS[j] ?? '?'
                      return (
                        <li
                          key={j}
                          className={cn('line-clamp-1', q.correct === letter && 'font-medium text-success')}
                        >
                          <span className="font-semibold">{letter}.</span>{' '}
                          {o || <span className="text-muted-foreground italic">—</span>}
                        </li>
                      )
                    })}
                  </ol>
                </td>
                <td className="px-3 py-2">
                  {answersOnly ? (
                    <NativeSelect
                      aria-label={t('exams.preview.answerFor', { number: q.number })}
                      value={q.correct ?? ''}
                      onChange={(e) => onChangeCorrect(q.key, e.target.value as OptionLetter)}
                      className="h-8 w-20"
                    >
                      {OPTION_LETTERS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <span className="font-semibold">{q.correct ?? '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{Number.isNaN(q.points) ? '—' : q.points}</td>
                <td className="px-3 py-2">
                  {qp.length === 0 ? (
                    <CheckCircle2 className="size-4 text-success" aria-label={t('exams.preview.ok')} />
                  ) : (
                    <ul className="space-y-0.5 text-xs text-destructive">
                      {qp.map((p) => (
                        <li key={p.key} className="flex gap-1">
                          <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          {t(p.key, p.values ?? {})}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                {!answersOnly && (
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => onMove(q.key, -1)}
                        disabled={i === 0}
                        aria-label={t('exams.preview.moveUp', { number: q.number })}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => onMove(q.key, 1)}
                        disabled={i === sorted.length - 1}
                        aria-label={t('exams.preview.moveDown', { number: q.number })}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => onEdit(q.key)}
                        aria-label={t('exams.preview.edit', { number: q.number })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(q.key)}
                        aria-label={t('exams.preview.delete', { number: q.number })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
