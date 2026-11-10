import { useTranslation } from 'react-i18next'
import { Check, CloudOff, Loader2, AlertTriangle } from 'lucide-react'
import type { SyncStatus } from '../useAnswerSync'

export function SaveIndicator({ status }: { status: SyncStatus }) {
  const { t } = useTranslation()
  let content
  switch (status) {
    case 'saving':
      content = (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t('room.saving')}
        </>
      )
      break
    case 'saved':
      content = (
        <span className="flex items-center gap-1 text-success">
          <Check className="size-3.5" aria-hidden /> {t('room.saved')}
        </span>
      )
      break
    case 'offline':
      content = (
        <span className="flex items-center gap-1 text-warning">
          <CloudOff className="size-3.5" aria-hidden /> {t('room.offlineShort')}
        </span>
      )
      break
    case 'error':
      content = (
        <span className="flex items-center gap-1 text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden /> {t('room.retrying')}
        </span>
      )
      break
    default:
      content = null
  }
  return (
    <span className="flex min-w-16 items-center gap-1 text-xs text-muted-foreground" role="status" aria-live="polite">
      {content}
    </span>
  )
}
