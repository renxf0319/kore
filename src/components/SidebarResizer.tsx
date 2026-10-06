import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'

/** 双击复位用的默认宽度，与 store 里的 SIDEBAR_W_DEFAULT 保持一致 */
const DEFAULT_W = 196

/**
 * 左侧栏右缘的拖拽把手（Typora 里就是一条可拖的竖线）。
 *
 * 实现要点：
 * 1. 用 **pointer 事件**（mousedown/mousemove 会被 iframe 与 CodeMirror 抢走），
 *    并 `setPointerCapture` 抓住指针 —— 指针划出窗口时仍能继续拖。
 * 2. 拖动时给 body 加 `user-select:none` + 隐藏 cursor，
 *    否则鼠标移过快会「失去跟踪」并误选正文文字。
 * 3. 宽度实时写入 store（已做 [140,520] 钳制 + localStorage 持久化）。
 * 4. 双击恢复默认宽度。
 */
export default function SidebarResizer() {
  const setSidebarW = useStore((s) => s.setSidebarW)
  const dragging = useRef(false)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setSidebarW(e.clientX)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('resizing-col')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-col')
    }
  }, [setSidebarW])

  return (
    <div
      className="sidebar-resizer no-print"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整侧栏宽度"
      title="拖动调整宽度，双击恢复默认"
      onPointerDown={(e) => {
        // 只响应左键；setPointerCapture 让指针移出把手也能继续拖
        if (e.button !== 0) return
        dragging.current = true
        document.body.classList.add('resizing-col')
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onDoubleClick={() => setSidebarW(DEFAULT_W)}
    />
  )
}
