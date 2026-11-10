import { useTranslation } from 'react-i18next'
import { CalendarClock, CheckCircle2, Radio } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/states'
import { useProfile } from '@/auth/useProfile'

// Phase 1: layout and empty states only. Phase 3 fills these from exam_status/attempts.
export default function DashboardPage() {
  const { t } = useTranslation()
  const profile = useProfile()
  const firstName = profile.data?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('dashboard.greeting', { name: firstName })}</h1>

      <Section icon={<Radio className="size-4 text-destructive" aria-hidden />} title={t('dashboard.live')}>
        <EmptyState title={t('dashboard.liveEmpty')} />
      </Section>

      <Section icon={<CalendarClock className="size-4" aria-hidden />} title={t('dashboard.upcoming')}>
        <EmptyState title={t('dashboard.upcomingEmpty')} />
      </Section>

      <Section icon={<CheckCircle2 className="size-4 text-success" aria-hidden />} title={t('dashboard.completed')}>
        <EmptyState title={t('dashboard.completedEmpty')} />
      </Section>
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}
