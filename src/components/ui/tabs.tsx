import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tab<T extends string> = { value: T; label: ReactNode }

/** Minimal WAI-ARIA tabs (arrow keys / Home / End). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
  label,
}: {
  tabs: Tab<T>[]
  value: T
  onChange: (v: T) => void
  children: ReactNode
  label: string
}) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    const tab = tabs[next]
    if (tab) {
      onChange(tab.value)
      refs.current[next]?.focus()
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
        {tabs.map((tab, i) => {
          const selected = tab.value === value
          return (
            <button
              key={tab.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              role="tab"
              type="button"
              id={`${id}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${value}`}
        className="mt-4"
      >
        {children}
      </div>
    </div>
  )
}
