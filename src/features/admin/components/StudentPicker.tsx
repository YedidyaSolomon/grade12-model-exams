import { useDeferredValue, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useStudents } from '../api'

export type PickedStudent = { id: string; full_name: string | null }

/** Search students by name / school / email and pick several. */
export function StudentPicker({
  value,
  onChange,
  label,
}: {
  value: PickedStudent[]
  onChange: (v: PickedStudent[]) => void
  label: string
}) {
  const { t } = useTranslation()
  const id = useId()
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search)
  const students = useStudents({ search: deferred, stream: '', status: '', page: 0 })
  const picked = new Set(value.map((v) => v.id))

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('students.picker.selected')}>
          {value.map((s) => (
            <li key={s.id} className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs">
              {s.full_name ?? t('students.noName')}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-background"
                onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                aria-label={t('students.picker.remove', { name: s.full_name ?? '' })}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('students.searchPlaceholder')}
          aria-label={t('students.searchPlaceholder')}
          className="h-9 pl-9"
        />
      </div>
      <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
        {students.isPending ? (
          <li className="p-2 text-muted-foreground">{t('common.loading')}</li>
        ) : students.isError ? (
          <li className="p-2 text-destructive">{t('common.errorGeneric')}</li>
        ) : students.data.rows.length === 0 ? (
          <li className="p-2 text-muted-foreground">{t('students.empty')}</li>
        ) : (
          students.data.rows.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={picked.has(s.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...value, { id: s.id, full_name: s.full_name }]
                        : value.filter((v) => v.id !== s.id),
                    )
                  }
                />
                <span className="flex-1">
                  {s.full_name ?? s.email ?? t('students.noName')}
                  <span className="text-xs text-muted-foreground"> · {s.school ?? '—'}</span>
                </span>
                {s.is_banned && <span className="text-xs text-destructive">{t('students.status.banned')}</span>}
              </label>
            </li>
          ))
        )}
      </ul>
    </fieldset>
  )
}
