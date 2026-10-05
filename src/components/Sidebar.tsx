import { useMemo } from 'react'
import { useStore } from '../state/store'
import { extractOutline } from '../lib/outline'
import { FileTree } from './FileTree'
import { ChevronLeft, PanelLeft } from 'lucide-react'

// 左侧栏：顶部「文件 / 大纲」两个页签，内容区按页签切换。
// 折叠由页签行右端的小箭头控制（Typora 的位置约定）。
export default function Sidebar() {
  const pane = useStore((s) => s.pane)
  const setPane = useStore((s) => s.setPane)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab${pane === 'files' ? ' active' : ''}`}
          onClick={() => setPane('files')}
        >
          文件
        </button>
        <button
          className={`sidebar-tab${pane === 'outline' ? ' active' : ''}`}
          onClick={() => setPane('outline')}
        >
          大纲
        </button>
        <button
          className="sidebar-collapse"
          onClick={toggleSidebar}
          title="收起左侧区域"
          aria-label="收起左侧区域"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      <div className="sidebar-body">
        {pane === 'files' ? <FileTree /> : <OutlineList />}
      </div>
    </aside>
  )
}

function OutlineList() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const setJumpLine = useStore((s) => s.setJumpLine)
  const tab = tabs.find((t) => t.id === active)
  const items = useMemo(() => extractOutline(tab?.content ?? ''), [tab?.content])

  if (!tab) return <div className="sidebar-empty">打开文档后显示大纲</div>
  if (items.length === 0) return <div className="sidebar-empty">本文档没有标题</div>

  return (
    <ul className="outline">
      {items.map((it, i) => (
        <li key={`${it.line}-${i}`} className={`lv-${it.level}`}>
          <button onClick={() => setJumpLine(it.line)}>{it.text}</button>
        </li>
      ))}
    </ul>
  )
}

// 左侧栏收起后贴在主区左边缘的展开把手
export function SidebarHandle() {
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  return (
    <button
      className="sidebar-handle no-print"
      onClick={toggleSidebar}
      title="展开左侧区域"
      aria-label="展开左侧区域"
    >
      <PanelLeft size={15} />
    </button>
  )
}
