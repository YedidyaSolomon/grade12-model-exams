import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'

// `import.meta.env.DEV` must be written inline here (not read from env.ts) so Vite replaces
// it with `false` in production builds and the bundler drops the DevLoginForm chunk entirely.
const DevLoginForm =
  import.meta.env.DEV && env.devLoginEnabled ? lazy(() => import('./DevLoginForm')) : null

export default function LoginPage() {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithTelegram() {
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      // Supabase custom OIDC provider (see docs/telegram-setup.md)
      provider: 'custom:telegram' as Provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setPending(false)
    }
    // On success the browser navigates away to Telegram.
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('app.name')}</CardTitle>
            <CardDescription>{t('app.tagline')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">{t('login.subtitle')}</p>
            <Button
              size="lg"
              className="w-full bg-[#229ED9] text-white hover:bg-[#1b8cc2]"
              onClick={() => void signInWithTelegram()}
              disabled={pending}
            >
              <Send aria-hidden />
              {pending ? t('login.redirecting') : t('login.telegram')}
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{t('login.failed', { message: error })}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {DevLoginForm && (
          <Suspense fallback={null}>
            <DevLoginForm />
          </Suspense>
        )}
      </div>
    </main>
  )
}
