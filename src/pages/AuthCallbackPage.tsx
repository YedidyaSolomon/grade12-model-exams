import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/states'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

/**
 * OAuth (PKCE) return URL. supabase-js exchanges ?code= for a session automatically
 * (detectSessionInUrl); we wait for it, or show the provider's error.
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    return (
      params.get('error_description') ??
      hash.get('error_description') ??
      params.get('error') ??
      hash.get('error')
    )
  })

  useEffect(() => {
    if (session) void navigate('/', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    if (error) return
    // Safety net: if no session appears (expired/used code), surface an error.
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session) setError(t('callback.failed'))
      })
    }, 10_000)
    return () => window.clearTimeout(timer)
  }, [error, t])

  if (!error) return <Loading fullScreen label={t('callback.finishing')} />

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="font-medium">{t('callback.failed')}</p>
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button asChild variant="outline">
        <Link to="/login">{t('callback.backToLogin')}</Link>
      </Button>
    </main>
  )
}
