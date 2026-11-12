import { useTranslation } from 'react-i18next'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'

export default function SuspendedPage() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <Ban className="size-10 text-destructive" aria-hidden />
      <h1 className="text-xl font-extrabold text-primary">{t('suspended.title')}</h1>
      <p className="max-w-sm text-muted-foreground">{t('suspended.body')}</p>
      <Button variant="outline" onClick={() => void signOut()}>
        {t('common.signOut')}
      </Button>
    </main>
  )
}
