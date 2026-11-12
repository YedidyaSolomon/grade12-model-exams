import { Link, NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, FileText, Inbox, LayoutDashboard, LogOut, Users, type LucideIcon } from 'lucide-react'
import { BrandMark } from '@/components/Brand'
import { useAuth } from '@/auth/AuthProvider'
import { usePendingRequestCount } from '@/features/admin/api'
import { cn } from '@/lib/utils'

type NavItem = { to: string; key: string; icon: LucideIcon; end: boolean; badge?: 'pending' }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'admin.nav.manage',
    items: [
      { to: '/admin', key: 'admin.overview', icon: LayoutDashboard, end: true },
      { to: '/admin/exams', key: 'admin.exams', icon: FileText, end: false },
      { to: '/admin/students', key: 'admin.students', icon: Users, end: false },
      { to: '/admin/requests', key: 'admin.requests', icon: Inbox, end: false, badge: 'pending' },
    ],
  },
]

/**
 * Admin shell. Tablet / laptop (md+): dark navy sidebar that stays in view. Phone: navy
 * top bar with a horizontally scrolling row of nav pills.
 */
export default function AdminLayout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const pending = usePendingRequestCount().data ?? 0

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
      isActive ? 'bg-sidebar-active text-white' : 'text-white/70 hover:bg-white/8 hover:text-white',
    )

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="z-20 bg-sidebar text-white md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        <div className="flex h-14 items-center justify-between gap-2 px-4 md:h-16 md:border-b md:border-white/10">
          <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-8 bg-sidebar-active" />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-extrabold">{t('admin.console')}</span>
              <span className="block truncate text-[0.6875rem] font-medium text-white/60">{t('app.name')}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label={t('common.signOut')}
            className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white md:hidden"
          >
            <LogOut className="size-[1.125rem]" aria-hidden />
          </button>
        </div>

        <nav aria-label={t('admin.title')} className="px-3 pb-3 md:flex-1 md:overflow-y-auto md:pt-4">
          {NAV.map((group) => (
            <div key={group.section} className="md:space-y-1">
              <p className="hidden px-3 pb-1 text-[0.6875rem] font-bold tracking-[0.08em] text-white/45 uppercase md:block">
                {t(group.section)}
              </p>
              <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {group.items.map(({ to, key, icon: Icon, end, badge }) => (
                  <NavLink key={to} to={to} end={end} className={itemClass}>
                    <Icon className="size-[1.125rem]" aria-hidden />
                    <span className="flex-1">{t(key)}</span>
                    {badge === 'pending' && pending > 0 && (
                      <span
                        className="rounded-full bg-gold px-1.5 py-0.5 text-[0.6875rem] leading-none font-extrabold text-gold-foreground tabular-nums"
                        aria-label={t('admin.pendingBadge', { count: pending })}
                      >
                        {pending}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden space-y-1 border-t border-white/10 p-3 md:block">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white"
          >
            <ArrowLeftRight className="size-[1.125rem]" aria-hidden />
            {t('admin.studentView')}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white"
          >
            <LogOut className="size-[1.125rem]" aria-hidden />
            {t('common.signOut')}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        {/* Phone: the student-view link lives here (the sidebar footer is tablet/laptop only). */}
        <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary md:hidden">
          <ArrowLeftRight className="size-3.5" aria-hidden />
          {t('admin.studentView')}
        </Link>
        <Outlet />
      </main>
    </div>
  )
}
