import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatEAT } from '@/lib/time'
import type { AuditEntry } from '../types'

/** Admin action log entries, newest first. */
export function AuditList({ entries, showTarget = true }: { entries: AuditEntry[]; showTarget?: boolean }) {
  const { t } = useTranslation()
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t('audit.empty')}</p>
  return (
    <ul className="divide-y text-sm">
      {entries.map((e) => {
        const reason = typeof e.details.reason === 'string' ? e.details.reason : null
        const note = typeof e.details.note === 'string' ? e.details.note : null
        return (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
            <span className="font-medium">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</span>
            {showTarget && e.target && e.target_user_id && (
              <Link to={`/admin/students/${e.target_user_id}`} className="hover:underline">
                {e.target}
              </Link>
            )}
            {e.exam_title && e.exam_id && (
              <Link to={`/admin/exams/${e.exam_id}/manage`} className="text-muted-foreground hover:underline">
                {e.exam_title}
              </Link>
            )}
            {!e.exam_id && e.exam_title && <span className="text-muted-foreground">{e.exam_title}</span>}
            {(reason || note) && <span className="text-muted-foreground">“{reason ?? note}”</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              {e.actor ?? t('audit.unknownActor')} · {formatEAT(e.created_at)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
