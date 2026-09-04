import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer: ReactNode
  className?: string
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

// Shared modal shell for confirm/prompt dialogs. Renders through a portal so
// it always sits above the page (and above the right-click context menu,
// which is portalled the same way) regardless of which component opens it.
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Focus + restore, keyed only on `open` — NOT on `onClose`, whose identity
  // churns on every parent re-render (most call sites pass an inline arrow).
  // Keying on it here would re-capture "previously focused" mid-dialog (e.g.
  // while typing in PromptDialog's input), corrupting the restore target.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const focusable = panelRef.current ? getFocusable(panelRef.current) : []
    ;(focusable[0] ?? panelRef.current)?.focus()
    return () => {
      previouslyFocused.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = getFocusable(panelRef.current)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-sm rounded-lg border bg-card p-4 text-card-foreground shadow-lg outline-none',
          className
        )}
      >
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        <div className="mb-4 text-sm text-muted-foreground">{children}</div>
        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body
  )
}
