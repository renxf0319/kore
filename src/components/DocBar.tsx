import { PanelLeft } from 'lucide-react'
import { useStore } from '../state/store'

// 底部栏：单文档模式下不再显示文档名/标签（当前文件已在左侧文件树高亮），
// 只保留左下角的左侧栏显隐按钮 —— 这是用户指定的位置。
export default function DocBar() {
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
    </div>
  )
}
