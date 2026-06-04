import { useEffect, useRef, useState, type ReactNode } from 'react'

// A small gear/settings dropdown. Tucks rarely-used or destructive actions
// (edit/delete a trip, change password…) behind one click so they aren't sitting
// exposed in the chrome. Closes on outside-click and Escape.
export function Menu({
  label,
  icon = '⚙️',
  align = 'end',
  children,
}: {
  label: string
  icon?: string
  align?: 'start' | 'end'
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="menu-trigger secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
      </button>
      {open && (
        <div className={`menu-popover menu-${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
