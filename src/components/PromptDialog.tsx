import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type PromptOptions = {
  title: string
  description?: ReactNode
  label: string
  placeholder?: string
  /** minimum trimmed length; 0 = optional */
  minLength?: number
  maxLength?: number
  confirmLabel?: string
  destructive?: boolean
  initialValue?: string
}

/**
 * const [prompt, dialog] = usePrompt()
 * const reason = await prompt({ title: 'Ban student?', label: 'Reason', minLength: 3 })
 * if (reason !== null) { ... }
 * A confirmation dialog with a text field (null = cancelled). Native <dialog>.
 */
export function usePrompt(): [(o: PromptOptions) => Promise<string | null>, ReactNode] {
  const { t } = useTranslation()
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const resolver = useRef<((v: string | null) => void) | null>(null)
  const [opts, setOpts] = useState<PromptOptions | null>(null)
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  const close = useCallback((result: string | null) => {
    ref.current?.close()
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }, [])

  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal()
  }, [opts])

  const prompt = useCallback((o: PromptOptions) => {
    resolver.current?.(null)
    setValue(o.initialValue ?? '')
    setTouched(false)
    setOpts(o)
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const min = opts?.minLength ?? 0
  const max = opts?.maxLength ?? 1000
  const len = value.trim().length
  const valid = len >= min && len <= max

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault()
        close(null)
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40"
    >
      {opts && (
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (valid) close(value.trim())
          }}
        >
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {opts.title}
          </h2>
          {opts.description && <div className="text-sm text-muted-foreground">{opts.description}</div>}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-input`}>
              {opts.label}
              {min === 0 && <span className="font-normal text-muted-foreground"> ({t('common.optional')})</span>}
            </Label>
            <Textarea
              id={`${id}-input`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={opts.placeholder}
              maxLength={max}
              rows={3}
              autoFocus
              aria-invalid={touched && !valid}
              aria-describedby={`${id}-hint`}
            />
            <p id={`${id}-hint`} className={touched && !valid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {min > 0 ? t('common.lengthHint', { min, max }) : t('common.maxLengthHint', { max })}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={opts.destructive ? 'destructive' : 'default'}>
              {opts.confirmLabel ?? t('common.confirm')}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )

  return [prompt, dialog]
}
