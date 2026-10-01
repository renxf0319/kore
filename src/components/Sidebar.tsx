import { useStore } from '../state/store'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react'
import type { FileNode } from '../lib/types'

export default function Sidebar() {
  const rootPath = useStore((s) => s.rootPath)
  const rootName = useStore((s) => s.rootName)
  const dirs = useStore((s) => s.dirs)
  const expanded = useStore((s) => s.expanded)
  const toggleExpand = useStore((s) => s.toggleExpand)
  const openFile = useStore((s) => s.openFile)
  const active = useStore((s) => s.active)

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
        className={`tree-row file ${node.path === active ? 'active' : ''}`}
        onClick={() => void openFile(node.path, node.name)}
      >
        <FileText size={14} />
        <span>{node.name}</span>
      </div>
    )
  }

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-head">
        <span>资源管理器</span>
      </div>
      {rootPath && (
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
      )}
    </aside>
  )
}
