import { useEffect, useRef, useState } from 'react'

/**
 * 文件树的右键菜单 + 两个小弹窗。
 *
 * 为什么不用 `window.prompt` / `window.confirm`：
 * **Tauri 的 WebView 不支持它们**（WebView2 里 `prompt()` 直接返回 null、
 * `confirm()` 恒为 false，而且不报错）。在桌面端用原生弹窗会表现为
 * 「点了没反应」，所以这里必须自己画。
 */

export interface MenuEntry {
  label: string
  onSelect: () => void
  /** 危险操作（删除）：文字染红，和普通项拉开距离 */
  danger?: boolean
  /** 在这一项**之前**画一条分隔线 */
  sep?: boolean
}

/**
 * 右键浮层。
 *
 * 定位用 `position: fixed` + 鼠标坐标（而不是 relative + 行内偏移）——
 * 文件树自己是个滚动容器，用 relative 会被裁掉、也会随滚动跑偏。
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // 贴边翻转：菜单不能被视口裁掉（右下角右键时最容易发生）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = x + r.width > window.innerWidth - 4 ? Math.max(4, x - r.width) : x
    const ny = y + r.height > window.innerHeight - 4 ? Math.max(4, y - r.height) : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // capture：点在别处时先关菜单，避免这次点击同时触发下面的元素
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    // 滚动时菜单会「悬空」在错误的位置，直接关掉最干净
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      className="ctx-menu no-print"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="menu-sep" />}
          <button
            className={`menu-item${it.danger ? ' danger' : ''}`}
            role="menuitem"
            onClick={() => {
              onClose()
              it.onSelect()
            }}
          >
            <span className="menu-check" />
            <span>{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * 输入名称的小弹窗（新建文件 / 新建文件夹）。
 *
 * Enter 确认、Esc 取消：这两个键是弹窗的通用肌肉记忆，缺了会被骂。
 */
export function NameDialog({
  title,
  hint,
  defaultValue,
  confirmText = '确定',
  onConfirm,
  onCancel,
}: {
  title: string
  hint?: string
  defaultValue: string
  confirmText?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // 只选中主文件名，扩展名留着 —— 多数时候用户只想改前缀，
    // 全选会让「敲字就把 .md 也吃掉了」，之后还得手动补回来。
    const dot = el.value.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
  }, [])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onConfirm(v)
  }

  return (
    <div className="modal-mask no-print" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{title}</div>
        {hint && <div className="modal-hint">{hint}</div>}
        <input
          ref={inputRef}
          className="modal-input"
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // 阻止冒泡：否则 Enter/Esc 会同时被外层的全局监听吃掉
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            }
          }}
        />
        <div className="modal-actions">
          <button className="modal-btn" onClick={submit} disabled={!value.trim()}>
            {confirmText}
          </button>
          <button className="modal-btn ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 二次确认弹窗。删除目录是**递归且不可撤销**的，必须让用户明确点一下。
 * 默认焦点给「取消」——防止顺手一个 Enter 就把东西删了。
 */
export function ConfirmDialog({
  title,
  body,
  confirmText = '删除',
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string
  body: React.ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-mask no-print" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button className={`modal-btn${danger ? ' danger' : ''}`} onClick={onConfirm}>
            {confirmText}
          </button>
          <button className="modal-btn ghost" ref={cancelRef} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
