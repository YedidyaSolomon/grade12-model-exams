import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/auth/useProfile'

/** Student home: white top bar (logo, admin link, sign out) over the pale page. */
export default function StudentLayout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const profile = useProfile()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16">
          <Brand />
          <div className="flex items-center gap-1">
            {profile.data?.role === 'admin' && (
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link to="/admin">
                  <Shield aria-hidden /> {t('admin.title')}
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => void signOut()}
              aria-label={t('common.signOut')}
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
