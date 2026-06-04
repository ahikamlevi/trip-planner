import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n/I18nProvider'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastOptions {
  message: string
  variant?: ToastVariant
  /** ms before auto-dismiss; 0 = stay until dismissed. Defaults: 6s with an action, else 3.5s. */
  duration?: number
  /** Optional action button (e.g. "Undo"). */
  actionLabel?: string
  onAction?: () => void
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastApi {
  show: (opts: ToastOptions) => void
  success: (message: string, opts?: Partial<ToastOptions>) => void
  error: (message: string, opts?: Partial<ToastOptions>) => void
  info: (message: string, opts?: Partial<ToastOptions>) => void
}

const ToastContext = createContext<ToastApi | null>(null)

// Lightweight, app-wide toasts: confirm instant-saves, surface friendly errors, and
// offer Undo on reversible actions. One provider mounted near the root; call useToast()
// anywhere below it.
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
    const tm = timers.current.get(id)
    if (tm) {
      clearTimeout(tm)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = (idRef.current += 1)
      const duration = opts.duration ?? (opts.actionLabel ? 6000 : 3500)
      setToasts((prev) => [...prev, { ...opts, id }])
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration))
    },
    [dismiss],
  )

  const api: ToastApi = useMemo(
    () => ({
      show,
      success: (message, o) => show({ message, variant: 'success', ...o }),
      error: (message, o) => show({ message, variant: 'error', ...o }),
      info: (message, o) => show({ message, variant: 'info', ...o }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-viewport" role="region" aria-live="polite" aria-label={t('toast.region')}>
          {toasts.map((tt) => (
            <div key={tt.id} className={`toast toast-${tt.variant ?? 'info'}`} role="status">
              <span className="toast-msg">{tt.message}</span>
              {tt.actionLabel && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    tt.onAction?.()
                    dismiss(tt.id)
                  }}
                >
                  {tt.actionLabel}
                </button>
              )}
              <button
                type="button"
                className="toast-close"
                aria-label={t('common.close')}
                onClick={() => dismiss(tt.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
