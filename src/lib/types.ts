export interface FileNode {
  name: string
  path: string
  isDir: boolean
}

export interface OpenTab {
  path: string
  name: string
  content: string
  savedContent: string
  dirty: boolean
}

export interface OutlineItem {
  level: number
  text: string
  id: string
}

export type ThemeMode = 'light' | 'dark'
