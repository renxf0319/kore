import { useStore } from '../state/store'
import { exportPdf, exportHtml } from '../lib/export'
import { markSrc } from '../lib/logo'
import {
  FolderOpen,
  FilePlus,
  FileDown,
  FileType,
  Sun,
  Moon,
} from 'lucide-react'

export default function Toolbar() {
  const openFolder = useStore((s) => s.openFolder)
  const newFile = useStore((s) => s.newFile)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const theme = useStore((s) => s.theme)
  const rootPath = useStore((s) => s.rootPath)
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)
  const previewHtml = useStore((s) => s.previewHtml)

  const setNotice = useStore((s) => s.setNotice)

  const onExportHtml = () => {
    const tab = tabs.find((t) => t.path === active)
    if (!tab) return
    exportHtml(tab.path, previewHtml, theme).catch((e: unknown) =>
      setNotice({
        kind: 'error',
        text: `导出 HTML 失败：${e instanceof Error ? e.message : String(e)}`,
      })
    )
  }

  const onExportPdf = () => {
    try {
      exportPdf()
    } catch (e) {
      setNotice({
        kind: 'error',
        text: `导出 PDF 失败：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return (
    <header className="toolbar no-print">
      <div className="brand">
        <img className="brand-mark" src={markSrc(theme)} alt="Kore" />
        <span className="brand-name">Kore</span>
      </div>
      <div className="spacer" />
      <button onClick={() => void openFolder()}>
        <FolderOpen size={16} /> 打开文件夹
      </button>
      <button onClick={() => void newFile()} disabled={!rootPath}>
        <FilePlus size={16} /> 新建
      </button>
      <button onClick={onExportHtml} disabled={!active}>
        <FileType size={16} /> 导出 HTML
      </button>
      <button onClick={onExportPdf} disabled={!active}>
        <FileDown size={16} /> 导出 PDF
      </button>
      <button className="icon" onClick={toggleTheme} title="切换主题">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  )
}
