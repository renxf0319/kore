import { useStore } from '../state/store'
import { wordmarkSrc } from '../lib/logo'
import { FilePlus, FileText, FolderOpen } from 'lucide-react'

export default function Welcome() {
  const theme = useStore((s) => s.theme)
  const newDoc = useStore((s) => s.newDoc)
  const openFileDialog = useStore((s) => s.openFileDialog)
  const openFolder = useStore((s) => s.openFolder)

  return (
    <div className="welcome">
      <div className="welcome-card">
        <img className="welcome-wordmark" src={wordmarkSrc(theme)} alt="Kore" />
        <p className="subtitle">极速 · 本地 · 开源的 Markdown 编辑器</p>
        <div className="welcome-actions">
          <button className="primary-btn" onClick={newDoc}>
            <FilePlus size={15} /> 新建文档
          </button>
          <button onClick={() => void openFileDialog()}>
            <FileText size={15} /> 打开文件
          </button>
          <button onClick={() => void openFolder()}>
            <FolderOpen size={15} /> 打开文件夹
          </button>
        </div>
        <p className="hint">不选工作区也能直接写，保存时再选择保存位置</p>
      </div>
    </div>
  )
}
