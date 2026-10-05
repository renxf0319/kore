import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { exportHtml, exportPdf } from '../lib/export'

type MenuKey = 'file' | 'theme' | null

interface Item {
  label?: string
  onSelect?: () => void
  children?: Item[]
  checked?: boolean
  danger?: boolean
  sep?: boolean
}

// Typora 式顶栏：文件 / 主题。点击展开，点击外部或 Esc 收起。
export default function MenuBar() {
  const [open, setOpen] = useState<MenuKey>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    // capture:true —— 菜单项里的 input 点击不该被误判为「点到外面」
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
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
          active={open === 'file'}
          onToggle={() => setOpen(open === 'file' ? null : 'file')}
        >
          <Items items={fileItems} onPick={run} />
        </Menu>
        <Menu
          label="主题"
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
  active,
  onToggle,
  children,
}: {
  label: string
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
      >
        {label}
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
  const activeTab = useStore((s) => s.activeTab)
  const setNotice = useStore((s) => s.setNotice)
  const theme = useStore((s) => s.theme)
  const newWindow = useNewWindow()

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
    { label: '新建窗口', onSelect: newWindow },
    { label: '新建文档', onSelect: () => newDoc() },
    { sep: true },
    { label: '打开…', onSelect: () => void openFileDialog() },
    { label: '打开文件夹…', onSelect: () => void openFolder() },
    { sep: true },
    { label: '保存', onSelect: () => void save() },
    { label: '另存为…', onSelect: () => void saveAs() },
    {
      label: '导出',
      children: [
        { label: '导出为 PDF…', onSelect: doExport('pdf') },
        { label: '导出为 HTML…', onSelect: doExport('html') },
      ],
    },
  ]
}

// 新建窗口：桌面端开新的 Tauri Webview 窗口，浏览器端开新标签页
function useNewWindow() {
  return () => {
    if (window.__TAURI_INTERNALS__) {
      void import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
        const label = `kore-${Date.now()}`
        new WebviewWindow(label, {
          url: 'index.html',
          title: 'Kore',
          width: 1200,
          height: 800,
        })
      })
      return
    }
    window.open(location.href, '_blank')
  }
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}
