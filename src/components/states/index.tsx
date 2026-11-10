import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Loading({ label, fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 p-6 text-muted-foreground',
        fullScreen && 'min-h-dvh',
      )}
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label ?? t('common.loading')}</span>
    </div>
  )
}

export function EmptyState({
  title,
  action,
  icon,
}: {
  title: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {icon ?? <Inbox className="size-6" aria-hidden />}
      <p>{title}</p>
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  fullScreen = false,
}: {
  message?: string
  onRetry?: () => void
  fullScreen?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-6 text-center',
        fullScreen && 'min-h-dvh',
      )}
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div>
        <p className="font-medium">{t('common.errorTitle')}</p>
        <p className="text-sm text-muted-foreground">{message ?? t('common.errorGeneric')}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
