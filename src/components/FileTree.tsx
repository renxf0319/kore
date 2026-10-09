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

/**
 * 单个目录 / 文件节点。
 *
 * ⚠️ 这个组件**必须定义在模块级**，不能写在 FileTree 函数体内部。
 *
 * 原因：写在函数体里时，每次 FileTree 重渲染都会得到一个**全新的组件类型**，
 * React 认为「原来的组件没了，换了个新组件」，于是卸载并重建整棵子树的 DOM。
 * 而 click 事件要求 mousedown 与 mouseup 落在**同一个元素**上 ——
 * 用户按下鼠标时节点还是旧的、松手时已被替换，浏览器就不会派发 click。
 * 表现就是「有些行点不进去，得点两三次」，且偶发、越靠下的行越明显
 * （它们在重建时更可能落在被换掉的节点上）。
 *
 * 附带好处：DOM 不再每次重建，hover 状态与滚动位置不会被吃掉。
 */

/**
 * 缩进封顶值。
 *
 * 侧栏最窄 140px，缩进按 13px/层算，封到 5 层 = 75px，
 * 剩下的宽度足够显示并点击文件名。再深的层级不再继续右移，
 * 否则深目录下的条目会被挤成一条点不中的缝。
 */
const MAX_INDENT_DEPTH = 5

function TreeNode({ node, depth = 1 }: { node: FileNode; depth?: number }) {
  const isOpen = useStore((s) => Boolean(s.expanded[node.path]))
  // 只订阅「当前激活文档的路径」这一个原始值，而不是整个 tabs 数组：
  // 文档内容每次按键都会变，订阅整个数组会让所有可见节点跟着重渲染。
  const activePath = useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.active)
    return t?.path ?? null
  })
  const isActive = !node.isDir && activePath === node.path
  const children = useStore((s) => s.dirs[node.path])
  const toggleExpand = useStore((s) => s.toggleExpand)
  const openFile = useStore((s) => s.openFile)

  // CSS 变量走内联 style：缩进要按**封顶后的**深度算，所以只能在 JS 里夹。
  const indent = { '--d': Math.min(depth, MAX_INDENT_DEPTH) } as React.CSSProperties

  if (node.isDir) {
    return (
      <div className="tree-node">
        <div
          className="tree-row"
          style={indent}
          onClick={() => toggleExpand(node.path)}
          role="treeitem"
          aria-expanded={isOpen}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpand(node.path)
            }
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span>{node.name}</span>
        </div>
        {isOpen && (
          <div className="tree-children" role="group">
            {(children || []).map((c) => (
              <TreeNode key={c.path} node={c} depth={depth + 1} />
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
      className={`tree-row file${isActive ? ' active' : ''}${supported ? '' : ' unsupported'}`}
      style={indent}
      onClick={() => void openFile(node.path, node.name)}
      role="treeitem"
      aria-selected={isActive}
      tabIndex={0}
      title={supported ? node.name : `${node.name}（暂不支持打开）`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void openFile(node.path, node.name)
        }
      }}
    >
      <FileText size={14} />
      <span>{node.name}</span>
    </div>
  )
}

// 左侧栏「文件」页签：工作区目录树（懒加载）
//
// 展示规则：默认**只列出受支持的纯文本类型**（见 lib/filetype.ts）。
// 目录永远保留 —— 否则用户没法进入子目录，也就没法找到里面支持的文件。
// 勾上「显示全部文件」后，未支持的条目会以灰色 + 禁止光标出现，
// 点下去得到一句明确的「暂不支持打开 xxx」，而不是报错或乱码。
export function FileTree() {
  const rootPath = useStore((s) => s.rootPath)
  const rootName = useStore((s) => s.rootName)
  const rootOpen = useStore((s) => Boolean(s.rootPath && s.expanded[s.rootPath]))
  const rootChildren = useStore((s) => (s.rootPath ? s.dirs[s.rootPath] : undefined))
  const toggleExpand = useStore((s) => s.toggleExpand)
  const openFolder = useStore((s) => s.openFolder)
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

  return (
    // ⚠️ 结构说明：`.tree-pane` = 滚动区 + 固定底栏 的竖向 flex 容器。
    // 开关必须住在**滚动区之外**，否则它会被长文件树顶出视口，
    // 也会随目录展开 / 折叠上下跳动 —— 位置不固定的功能开关等于没有。
    <div className="tree-pane">
      <div className="tree-scroll">
        <div className="tree" role="tree">
          <div
            className="tree-row"
            onClick={() => toggleExpand(rootPath)}
            role="treeitem"
            aria-expanded={rootOpen}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleExpand(rootPath)
              }
            }}
          >
            {rootOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={14} />
            <span className="root-name">{rootName}</span>
          </div>
          {rootOpen && (
            <div className="tree-children" role="group">
              {(rootChildren || []).map((c) => (
                <TreeNode key={c.path} node={c} />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 「显示全部文件」：去掉勾选框，只留眼睛图标。
          眼睛本身就是开关（Eye / EyeOff 两种状态即状态指示），
          含义靠 title / aria-label 说明 —— 图标比勾选框更省横向空间，
          且在 140px 的窄侧栏里也不会把文件名挤掉。 */}
      <button
        className="tree-toggle"
        onClick={() => setShowAllFiles(!showAllFiles)}
        title={
          showAllFiles
            ? '正在显示全部文件 · 点击改为只显示可编辑的文本类型'
            : '正在只显示可编辑的文本类型 · 点击显示全部文件'
        }
        aria-label="显示全部文件"
        aria-pressed={showAllFiles}
      >
        {showAllFiles ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  )
}
