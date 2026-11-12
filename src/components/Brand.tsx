import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Navy tile with a graduation cap. `inverted` = white tile for use on navy surfaces. */
export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg',
        inverted ? 'bg-white text-primary' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <GraduationCap className="size-5" strokeWidth={2.25} />
    </span>
  )
}

/** Logo + app name, linking home. */
export function Brand({ to = '/', subtitle, inverted = false }: { to?: string; subtitle?: string; inverted?: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2.5">
      <BrandMark inverted={inverted} />
      <span className="min-w-0 leading-tight">
        <span className={cn('block truncate text-[0.9375rem] font-extrabold', inverted ? 'text-white' : 'text-primary')}>
          {subtitle ?? t('app.name')}
        </span>
        {subtitle && (
          <span className={cn('block truncate text-[0.6875rem] font-semibold', inverted ? 'text-white/70' : 'text-muted-foreground')}>
            {t('app.name')}
          </span>
        )}
      </span>
    </Link>
  )
}
