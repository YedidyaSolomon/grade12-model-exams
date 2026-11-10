function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local.`)
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  /**
   * Email/password dev login. `import.meta.env.DEV` is a build-time constant that is
   * `false` in production builds, so the dev login code is stripped from the bundle
   * no matter what VITE_ENABLE_DEV_LOGIN says. The real protection is server-side:
   * the cloud project has the Email provider disabled (docs/telegram-setup.md).
   */
  devLoginEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true',
} as const
