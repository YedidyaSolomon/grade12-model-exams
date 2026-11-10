import * as React from 'react'
import { cn } from '@/lib/utils'

/** Styled native <select>: accessible, works well on phones, zero JS cost. */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { NativeSelect }
