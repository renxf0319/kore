import { useStore } from '../state/store'
import { FolderOpen } from 'lucide-react'

export default function Welcome() {
  const openFolder = useStore((s) => s.openFolder)

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo" />
        <h1>Inkwell</h1>
        <p className="subtitle">极速 · 本地 · 开源的 Markdown 编辑器</p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => void openFolder()}>
            <FolderOpen size={18} /> 打开文件夹
          </button>
          <span className="hint">所有文件都留在你的电脑上，不做任何云同步。</span>
        </div>
      </div>
    </div>
  )
}
