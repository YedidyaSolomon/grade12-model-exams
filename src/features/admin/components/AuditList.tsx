import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatEAT } from '@/lib/time'
import type { AuditEntry } from '../types'

/** Admin action log entries, newest first, drawn as a timeline. */
export function AuditList({ entries, showTarget = true }: { entries: AuditEntry[]; showTarget?: boolean }) {
  const { t } = useTranslation()
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t('audit.empty')}</p>
  return (
    <ul className="relative text-sm before:absolute before:top-4 before:bottom-4 before:left-[0.4375rem] before:w-0.5 before:rounded-full before:bg-border">
      {entries.map((e) => {
        const reason = typeof e.details.reason === 'string' ? e.details.reason : null
        const note = typeof e.details.note === 'string' ? e.details.note : null
        return (
          <li key={e.id} className="relative flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2.5 pl-7">
            <span aria-hidden className="absolute top-[0.9rem] left-0 size-4 rounded-full border-4 border-card bg-primary ring-2 ring-primary-soft" />
            <span className="font-extrabold">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</span>
            {showTarget && e.target && e.target_user_id && (
              <Link to={`/admin/students/${e.target_user_id}`} className="font-semibold text-primary hover:underline">
                {e.target}
              </Link>
            )}
            {e.exam_title && e.exam_id && (
              <Link to={`/admin/exams/${e.exam_id}/manage`} className="font-semibold text-muted-foreground hover:text-primary hover:underline">
                {e.exam_title}
              </Link>
            )}
            {!e.exam_id && e.exam_title && <span className="font-semibold text-muted-foreground">{e.exam_title}</span>}
            {(reason || note) && (
              <span className="rounded-lg bg-muted px-1.5 text-muted-foreground italic">“{reason ?? note}”</span>
            )}
            <span className="w-full text-xs font-semibold text-muted-foreground sm:ml-auto sm:w-auto">
              {e.actor ?? t('audit.unknownActor')} · {formatEAT(e.created_at)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
