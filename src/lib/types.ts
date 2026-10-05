export interface FileNode {
  name: string
  path: string
  isDir: boolean
}

export interface OpenTab {
  /** 编辑器内稳定唯一的标识；未命名文档没有磁盘路径，用它当 key */
  id: string
  /** 磁盘路径；未命名文档为 null，此时保存会转入「另存为」 */
  path: string | null
  name: string
  content: string
  savedContent: string
  dirty: boolean
}

export interface OutlineItem {
  level: number
  text: string
  /** 标题所在行号（1 起）；WYSIWYG 下没有 DOM 锚点，跳转靠行号 */
  line: number
  /** 与 markdown-it-anchor 生成的锚点 id 一致，供导出 HTML / 将来做锚点分享 */
  id: string
}

export type ThemeMode = 'light' | 'dark'

/** 左侧栏当前显示的页签 */
export type SidePane = 'files' | 'outline'
