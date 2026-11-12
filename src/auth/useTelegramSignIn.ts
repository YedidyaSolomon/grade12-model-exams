import { useState } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Starts the Telegram OAuth flow (Supabase custom OIDC provider, see docs/telegram-setup.md). */
export function useTelegramSignIn() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:telegram' as Provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setPending(false)
    }
    // On success the browser navigates away to Telegram.
  }

  return { signIn: () => void signIn(), pending, error }
}
