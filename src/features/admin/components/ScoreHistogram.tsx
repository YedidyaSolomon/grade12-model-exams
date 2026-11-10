import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Score distribution: students per 10-percentage-point band. One series, so one hue
 * (primary); identity is in the title, values on hover/focus and in the results table.
 * Thin bars with 4px rounded tops anchored to the baseline and 2px gaps.
 */
export function ScoreHistogram({ percentages }: { percentages: number[] }) {
  const { t } = useTranslation()
  const id = useId()
  const [active, setActive] = useState<number | null>(null)

  const bins = Array.from({ length: 10 }, (_, i) => ({
    from: i * 10,
    to: i === 9 ? 100 : i * 10 + 9,
    count: 0,
  }))
  for (const p of percentages) {
    const i = Math.min(9, Math.max(0, Math.floor(p / 10)))
    bins[i]!.count++
  }
  const max = Math.max(1, ...bins.map((b) => b.count))
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max]

  return (
    <figure className="space-y-2" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="text-sm font-medium">
        {t('results.distribution')}
        <span className="font-normal text-muted-foreground"> · {t('results.distributionHint')}</span>
      </figcaption>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative h-40 w-6 text-right text-[10px] text-muted-foreground tabular-nums" aria-hidden>
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(v / max) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="relative h-40 border-b border-border">
            {ticks.slice(1).map((v) => (
              <div
                key={v}
                className="absolute inset-x-0 border-t border-dashed border-border/60"
                style={{ bottom: `${(v / max) * 100}%` }}
                aria-hidden
              />
            ))}
            <ul className="absolute inset-0 flex items-end gap-0.5" aria-label={t('results.distribution')}>
              {bins.map((b, i) => (
                <li key={b.from} className="relative flex h-full flex-1 items-end">
                  <button
                    type="button"
                    className="group flex h-full w-full items-end focus-visible:outline-none"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={t('results.binLabel', { from: b.from, to: b.to, count: b.count })}
                  >
                    <span
                      className="w-full rounded-t-[4px] bg-primary transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-ring"
                      style={{
                        height: b.count ? `${(b.count / max) * 100}%` : 0,
                        opacity: active === null || active === i ? 1 : 0.45,
                      }}
                    />
                  </button>
                  {active === i && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border bg-card px-2 py-1 text-xs whitespace-nowrap text-card-foreground shadow-sm"
                    >
                      <span className="font-medium tabular-nums">{b.count}</span> · {b.from}–{b.to}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-1 flex gap-0.5 text-[10px] text-muted-foreground tabular-nums" aria-hidden>
            {bins.map((b) => (
              <span key={b.from} className="flex-1 text-center">
                {b.from}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}
