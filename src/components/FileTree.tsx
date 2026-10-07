import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useStore } from '../state/store'
import type { FileNode } from '../lib/types'
import { isSupportedFile } from '../lib/filetype'

// 左侧栏「文件」页签：工作区目录树（懒加载）
//
// 展示规则：默认**只列出受支持的纯文本类型**（见 lib/filetype.ts）。
// 目录永远保留 —— 否则用户没法进入子目录，也就没法找到里面支持的文件。
// 勾上「显示全部文件」后，未支持的条目会以灰色 + 禁止光标出现，
// 点下去得到一句明确的「暂不支持打开 xxx」，而不是报错或乱码。
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
  const showAllFiles = useStore((s) => s.showAllFiles)
  const setShowAllFiles = useStore((s) => s.setShowAllFiles)

  if (!rootPath) {
    // 按需求：空态只留一个「打开文件夹」按钮，不做任何文字说明。
    // Typora 左侧栏无工作区时也是极简的，文字提示反而像在教用户。
    return (
      <div className="sidebar-empty">
        <button className="ghost-btn" onClick={() => void openFolder()}>
          <FolderOpen size={14} /> 打开文件夹
        </button>
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
    // showAllFiles 关闭时 store 已经过滤过了；这里再判一次是为了
    // 「显示全部文件」打开后的灰显样式，两条渲染路径共用同一套判定。
    const supported = isSupportedFile(node.name)
    return (
      <div
        className={`tree-row file${node.path === activePath ? ' active' : ''}${
          supported ? '' : ' unsupported'
        }`}
        onClick={() => void openFile(node.path, node.name)}
        title={supported ? node.name : `${node.name}（暂不支持打开）`}
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
      {/* 开关放在树的底部：默认收起不抢视线，但它决定了「为什么我看到的文件这么少」 */}
      <label className="tree-toggle" title="显示白名单之外的文件（图片、jar、class 等）">
        <input
          type="checkbox"
          checked={showAllFiles}
          onChange={(e) => setShowAllFiles(e.target.checked)}
        />
        {showAllFiles ? <Eye size={13} /> : <EyeOff size={13} />}
        <span>显示全部文件</span>
      </label>
    </div>
  )
}
