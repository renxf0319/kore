import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react'
import { useStore } from '../state/store'
import type { FileNode } from '../lib/types'

// 左侧栏「文件」页签：工作区目录树（懒加载）
export function FileTree() {
  const rootPath = useStore((s) => s.rootPath)
  const rootName = useStore((s) => s.rootName)
  const dirs = useStore((s) => s.dirs)
  const expanded = useStore((s) => s.expanded)
  const toggleExpand = useStore((s) => s.toggleExpand)
  const openFile = useStore((s) => s.openFile)
  const openFolder = useStore((s) => s.openFolder)
  const active = useStore((s) => s.active)
  const tabs = useStore((s) => s.tabs)

  if (!rootPath) {
    return (
      <div className="sidebar-empty">
        <p>尚未打开工作区</p>
        <button className="ghost-btn" onClick={() => void openFolder()}>
          打开文件夹
        </button>
        <p className="dim">也可以直接「文件 → 打开」单个文件，或「新建文档」后另存为</p>
      </div>
    )
  }

  const activePath = tabs.find((t) => t.id === active)?.path ?? null

  const Node = ({ node }: { node: FileNode }) => {
    const isOpen = expanded[node.path]
    if (node.isDir) {
      return (
        <div className="tree-node">
          <div className="tree-row" onClick={() => toggleExpand(node.path)}>
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
            <span>{node.name}</span>
          </div>
          {isOpen && (
            <div className="tree-children">
              {(dirs[node.path] || []).map((c) => (
                <Node key={c.path} node={c} />
              ))}
            </div>
          )}
        </div>
      )
    }
    return (
      <div
        className={`tree-row file${node.path === activePath ? ' active' : ''}`}
        onClick={() => void openFile(node.path, node.name)}
      >
        <FileText size={14} />
        <span>{node.name}</span>
      </div>
    )
  }

  return (
    <div className="tree">
      <div className="tree-row" onClick={() => toggleExpand(rootPath)}>
        {expanded[rootPath] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} />
        <span className="root-name">{rootName}</span>
      </div>
      {expanded[rootPath] && (
        <div className="tree-children">
          {(dirs[rootPath] || []).map((c) => (
            <Node key={c.path} node={c} />
          ))}
        </div>
      )}
    </div>
  )
}
