import { Link, NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FileText, LayoutDashboard, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', key: 'admin.overview', icon: LayoutDashboard, end: true },
  { to: '/admin/exams', key: 'admin.exams', icon: FileText, end: false },
] as const

export default function AdminLayout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-card md:w-56 md:border-r md:border-b-0">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="font-semibold">{t('admin.title')}</span>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label={t('common.signOut')}>
            <LogOut aria-hidden />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                  isActive ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {t(key)}
            </NavLink>
          ))}
          <Link to="/" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
            {t('admin.studentView')}
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
