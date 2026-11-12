import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Brand } from '@/components/Brand'
import { useTelegramSignIn } from '@/auth/useTelegramSignIn'
import { env } from '@/lib/env'

// `import.meta.env.DEV` must be written inline here (not read from env.ts) so Vite replaces
// it with `false` in production builds and the bundler drops the DevLoginForm chunk entirely.
const DevLoginForm =
  import.meta.env.DEV && env.devLoginEnabled ? lazy(() => import('./DevLoginForm')) : null

/** Sign-in page (deep links land here). The public home page at "/" has the same button. */
export default function LoginPage() {
  const { t } = useTranslation()
  const tg = useTelegramSignIn()

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:h-16">
          <Brand />
        </div>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-sm space-y-4">
          <div className="overflow-hidden rounded-xl border bg-card card-shadow">
            <div className="h-1 bg-primary" aria-hidden />
            <div className="space-y-5 p-6">
              <div>
                <h1 className="text-2xl font-extrabold text-primary">{t('login.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('login.subtitle')}</p>
              </div>
              <Button variant="telegram" size="lg" className="w-full" onClick={tg.signIn} disabled={tg.pending}>
                <Send aria-hidden />
                {tg.pending ? t('login.redirecting') : t('login.telegram')}
              </Button>
              {tg.error && (
                <Alert variant="destructive">
                  <AlertDescription>{t('login.failed', { message: tg.error })}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {DevLoginForm && (
            <Suspense fallback={null}>
              <DevLoginForm />
            </Suspense>
          )}

          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> {t('login.backHome')}
          </Link>
        </div>
      </div>
    </main>
  )
}
