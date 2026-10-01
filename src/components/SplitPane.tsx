import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export default function SplitPane({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  const [pct, setPct] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const p = ((e.clientX - rect.left) / rect.width) * 100
      setPct(Math.min(80, Math.max(20, p)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onDown = () => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="split" ref={ref}>
      <div className="split-left" style={{ width: `${pct}%` }}>
        {left}
      </div>
      <div className="split-divider" onMouseDown={onDown} />
      <div className="split-right" style={{ width: `${100 - pct}%` }}>
        {right}
      </div>
    </div>
  )
}
