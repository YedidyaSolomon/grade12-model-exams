import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/auth/useProfile'

export default function StudentLayout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const profile = useProfile()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <Link to="/" className="truncate font-semibold">
            {t('app.name')}
          </Link>
          <div className="flex items-center gap-1">
            {profile.data?.role === 'admin' && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <Shield aria-hidden /> {t('admin.title')}
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label={t('common.signOut')}>
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
