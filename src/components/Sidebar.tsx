import { useMemo } from 'react'
import { useStore } from '../state/store'
import { extractOutline } from '../lib/outline'
import { FileTree } from './FileTree'

// 左侧栏：顶部「文件 / 大纲」两个页签，内容区按页签切换。
// 显隐控制**不在这里** —— 按用户要求放在底部栏左下角（DocBar）。
// 宽度由 App 传入（store.sidebarW，随右侧竖线拖动变化）。
export default function Sidebar({ style }: { style?: React.CSSProperties }) {
  const pane = useStore((s) => s.pane)
  const setPane = useStore((s) => s.setPane)

  return (
    <aside className="sidebar no-print" style={style}>
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

  if (!tab) return <div className="sidebar-empty">无标题</div>
  if (items.length === 0) return <div className="sidebar-empty">无标题</div>

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
