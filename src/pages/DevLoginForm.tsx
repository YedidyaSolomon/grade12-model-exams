import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'

/**
 * DEVELOPMENT ONLY. Loaded only when import.meta.env.DEV is true and
 * VITE_ENABLE_DEV_LOGIN=true. Signs in test users created in the dev project's dashboard.
 * The production project must have the Email provider disabled (docs/telegram-setup.md).
 */
export default function DevLoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (error) setError(error.message)
    else void navigate('/', { replace: true })
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-3 rounded-xl border-2 border-dashed border-warning bg-warning/5 p-5"
    >
      <div>
        <p className="text-sm font-semibold">{t('login.devTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('login.devHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-email">{t('login.email')}</Label>
        <Input
          id="dev-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-password">{t('login.password')}</Label>
        <Input
          id="dev-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="press-outline" className="w-full" disabled={pending}>
        {t('login.devSubmit')}
      </Button>
    </form>
  )
}
