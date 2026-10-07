import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { exportHtml, exportPdf } from '../lib/export'
import { newWindow, shortcutOf } from '../lib/commands'

type MenuKey = 'file' | 'theme' | null

interface Item {
  label?: string
  onSelect?: () => void
  children?: Item[]
  checked?: boolean
  danger?: boolean
  sep?: boolean
  /** 关联 commands.ts 里的命令 id；用于自动渲染右侧快捷键提示 */
  cmdId?: string
}

// Typora 式顶栏：文件 / 主题。点击展开，点击外部或 Esc 收起。
export default function MenuBar() {
  const [open, setOpen] = useState<MenuKey>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Alt+F / Alt+T 直接展开对应菜单；Esc 收起。
    // 即便菜单当前是关着的也要监听，所以这个 effect 不依赖 open。
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null)
        return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'f') {
        e.preventDefault()
        setOpen('file')
      } else if (k === 't') {
        e.preventDefault()
        setOpen('theme')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    // capture:true —— 菜单项里的 input 点击不该被误判为「点到外面」
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  const run = (fn?: () => void) => {
    setOpen(null)
    fn?.()
  }

  const fileItems = useFileItems()

  return (
    <div className="menubar no-print" ref={barRef}>
      <div className="menubar-inner">
        <Menu
          label="文件"
          accelKey="F"
          active={open === 'file'}
          onToggle={() => setOpen(open === 'file' ? null : 'file')}
        >
          <Items items={fileItems} onPick={run} />
        </Menu>
        <Menu
          label="主题"
          accelKey="T"
          active={open === 'theme'}
          onToggle={() => setOpen(open === 'theme' ? null : 'theme')}
        >
          <ThemeItems onPick={run} />
        </Menu>
      </div>
    </div>
  )
}

function Menu({
  label,
  accelKey,
  active,
  onToggle,
  children,
}: {
  label: string
  /** 菜单名的记忆键，显示为「文件(F)」，Alt+F 可直接展开 */
  accelKey?: string
  active: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="menu-root">
      <button
        className={`menu-trigger${active ? ' open' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={active}
        title={accelKey ? `Alt+${accelKey}` : undefined}
      >
        {label}
        {accelKey && <span className="menu-accel-key">({accelKey})</span>}
      </button>
      {active && (
        <div className="menu-pop no-print" role="menu">
          {children}
        </div>
      )}
    </div>
  )
}

function Items({ items, onPick }: { items: Item[]; onPick: (fn?: () => void) => void }) {
  return (
    <>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : it.children ? (
          <SubMenu key={i} label={it.label ?? ''} items={it.children} onPick={onPick} />
        ) : (
          <button
            key={i}
            className={`menu-item${it.checked ? ' checked' : ''}`}
            role="menuitem"
            onClick={() => onPick(it.onSelect)}
          >
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span>{it.label}</span>
            {shortcutOf(it.cmdId) && (
              <span className="menu-accel">{shortcutOf(it.cmdId)}</span>
            )}
          </button>
        )
      )}
    </>
  )
}

function SubMenu({
  label,
  items,
  onPick,
}: {
  label: string
  items: Item[]
  onPick: (fn?: () => void) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className="menu-sub"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button className="menu-item has-sub" role="menuitem">
        <span className="menu-check" />
        <span>{label}</span>
        <span className="menu-arrow">›</span>
      </button>
      {hover && (
        <div className="menu-pop sub no-print" role="menu">
          <Items items={items} onPick={onPick} />
        </div>
      )}
    </div>
  )
}

function ThemeItems({ onPick }: { onPick: (fn?: () => void) => void }) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const items: Item[] = [
    { label: '白色（默认）', checked: theme === 'light', onSelect: () => setTheme('light') },
    { label: '黑色', checked: theme === 'dark', onSelect: () => setTheme('dark') },
  ]
  return <Items items={items} onPick={onPick} />
}

function useFileItems(): Item[] {
  const newDoc = useStore((s) => s.newDoc)
  const openFileDialog = useStore((s) => s.openFileDialog)
  const openFolder = useStore((s) => s.openFolder)
  const save = useStore((s) => s.save)
  const saveAs = useStore((s) => s.saveAs)
  const closeDoc = useStore((s) => s.closeDoc)
  const activeTab = useStore((s) => s.activeTab)
  const setNotice = useStore((s) => s.setNotice)
  const theme = useStore((s) => s.theme)

  const doExport = (kind: 'html' | 'pdf') => async () => {
    const t = activeTab()
    if (!t) {
      setNotice({ kind: 'info', text: '没有可导出的文档' })
      return
    }
    try {
      if (kind === 'html') {
        const name = await exportHtml(t.path ?? t.name, t.content, theme)
        setNotice({ kind: 'info', text: `已导出 ${name}` })
      } else {
        await exportPdf(t.content, theme)
      }
    } catch (e) {
      setNotice({
        kind: 'error',
        text: `导出失败：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return [
    { label: '新建窗口', cmdId: 'file.newWindow', onSelect: newWindow },
    { label: '新建文档', onSelect: () => newDoc() },
    { sep: true },
    { label: '打开…', onSelect: () => void openFileDialog() },
    { label: '打开文件夹…', onSelect: () => void openFolder() },
    { sep: true },
    { label: '保存', cmdId: 'file.save', onSelect: () => void save() },
    { label: '另存为…', cmdId: 'file.saveAs', onSelect: () => void saveAs() },
    {
      label: '导出',
      children: [
        { label: '导出为 PDF…', onSelect: doExport('pdf') },
        { label: '导出为 HTML…', onSelect: doExport('html') },
      ],
    },
    { sep: true },
    // 单文档模式下底部栏不再放关闭按钮，关闭入口挪到这里
    { label: '关闭文档', onSelect: () => closeDoc() },
  ]
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}
