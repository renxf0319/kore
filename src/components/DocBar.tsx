import { FileText, PanelLeft, X } from 'lucide-react'
import { useStore } from '../state/store'

// 底部栏（单文档模式）：
//   左下角 = 左侧栏显隐按钮（用户明确要求放在左下角）
//   中间   = 当前文档名 + 未保存圆点 + 关闭
// 不再有多标签：切换文件直接覆盖，未保存时由 store 弹确认框。
export default function DocBar() {
  const tab = useStore((s) => (s.active ? (s.tabs.find((t) => t.id === s.active) ?? null) : null))
  const closeDoc = useStore((s) => s.closeDoc)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <div className="docbar no-print">
      <button
        className="docbar-sidebar-btn"
        onClick={toggleSidebar}
        title={sidebarOpen ? '隐藏左侧栏' : '显示左侧栏'}
        aria-label={sidebarOpen ? '隐藏左侧栏' : '显示左侧栏'}
        aria-pressed={sidebarOpen}
      >
        <PanelLeft size={15} />
      </button>

      {tab ? (
        <>
          <div className={`docbar-name${tab.dirty ? ' dirty' : ''}`} title={tab.path ?? '未命名'}>
            <FileText size={13} />
            <span>{tab.name}</span>
            {tab.dirty && <span className="docbar-dot" aria-label="未保存" />}
          </div>
          <button className="docbar-close" onClick={closeDoc} title="关闭文档" aria-label="关闭文档">
            <X size={14} />
          </button>
        </>
      ) : (
        <span className="docbar-empty">无文档</span>
      )}
    </div>
  )
}
