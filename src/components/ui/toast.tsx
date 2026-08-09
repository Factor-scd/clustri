import { createContext, useCallback, useContext, useState } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, variant?: ToastVariant) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => removeToast(id), 5000)
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[]
  onRemove: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

const variantStyles: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; bar: string; iconColor: string }> = {
  success: {
    icon: CheckCircle,
    bar: 'border-l-success',
    iconColor: 'text-success',
  },
  error: {
    icon: AlertCircle,
    bar: 'border-l-destructive',
    iconColor: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    bar: 'border-l-warning',
    iconColor: 'text-warning',
  },
  info: {
    icon: Info,
    bar: 'border-l-info',
    iconColor: 'text-info',
  },
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: (id: string) => void
}) {
  const config = variantStyles[toast.variant]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border border-border border-l-2 bg-card p-3.5 text-sm text-foreground shadow-lg shadow-black/10 dark:shadow-black/40',
        config.bar
      )}
      style={{
        animation: 'toast-slide-in 0.3s ease-out',
      }}
    >
      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconColor)} />
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded-md p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-foreground hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
