import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Phase 4 replaces this with the full result page.
export default function SubmittedPage() {
  const { t } = useTranslation()
  const state = (useLocation().state ?? {}) as { auto?: boolean; late?: boolean }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {state.auto ? (
        <Clock className="size-12 text-warning" aria-hidden />
      ) : (
        <CheckCircle2 className="size-12 text-success" aria-hidden />
      )}
      <h1 className="text-2xl font-semibold">{state.auto ? t('done.autoTitle') : t('done.title')}</h1>
      <p className="max-w-sm text-muted-foreground">
        {state.late ? t('done.lateBody') : state.auto ? t('done.autoBody') : t('done.body')}
      </p>
      <Button asChild size="lg">
        <Link to="/" replace>
          {t('done.backToDashboard')}
        </Link>
      </Button>
    </main>
  )
}
