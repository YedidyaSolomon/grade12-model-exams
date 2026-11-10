import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
}

/**
 * const [confirm, dialog] = useConfirm()
 * if (await confirm({ title: 'Delete?', destructive: true })) { ... }
 * Render {dialog} once. Uses native <dialog>: focus trap, Esc to cancel, top layer.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)

  const close = useCallback((result: boolean) => {
    ref.current?.close()
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }, [])

  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal()
  }, [opts])

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false)
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        close(false)
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40"
    >
      {opts && (
        <div className="space-y-4 p-5">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {opts.title}
          </h2>
          {opts.description && <div className="text-sm text-muted-foreground">{opts.description}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)} autoFocus>
              {t('common.cancel')}
            </Button>
            <Button variant={opts.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
              {opts.confirmLabel ?? t('common.confirm')}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )

  return [confirm, dialog]
}
