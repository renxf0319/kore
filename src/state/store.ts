import { create } from 'zustand'
import type { OpenTab, ThemeMode } from '../lib/types'
import { fsApi, isTauri } from '../lib/fs'
import { applyTheme, getStoredTheme } from '../lib/theme'

interface AppState {
  theme: ThemeMode
  mode: 'tauri' | 'browser' | 'unknown'
  rootPath: string | null
  rootName: string | null
  expanded: Record<string, boolean>
  dirs: Record<string, { name: string; path: string; isDir: boolean }[]>
  tabs: OpenTab[]
  active: string | null
  previewHtml: string
  ready: boolean

  init: () => Promise<void>
  setTheme: (t: ThemeMode) => void
  toggleTheme: () => void
  openFolder: () => Promise<void>
  loadDir: (path: string) => Promise<void>
  toggleExpand: (path: string) => void
  openFile: (path: string, name: string) => Promise<void>
  closeTab: (path: string) => void
  setActive: (path: string) => void
  updateContent: (path: string, content: string) => void
  saveActive: () => Promise<void>
  newFile: () => Promise<void>
  setPreviewHtml: (html: string) => void
}

export const useStore = create<AppState>((set, get) => ({
  theme: 'light',
  mode: 'unknown',
  rootPath: null,
  rootName: null,
  expanded: {},
  dirs: {},
  tabs: [],
  active: null,
  previewHtml: '',
  ready: false,

  async init() {
    const theme = getStoredTheme()
    applyTheme(theme)
    const mode = isTauri ? 'tauri' : 'browser'
    set({ theme, mode })
    const root = await fsApi.restore()
    if (root) {
      set({ rootPath: root, rootName: rootNameOf(root) })
      await get().loadDir(root)
    }
    set({ ready: true })
  },

  setTheme(t) {
    applyTheme(t)
    set({ theme: t })
  },

  toggleTheme() {
    const t = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(t)
    set({ theme: t })
  },

  async openFolder() {
    const p = await fsApi.pickFolder()
    if (!p) return
    set({ rootPath: p, rootName: rootNameOf(p), expanded: { [p]: true } })
    await fsApi.persistRoot(p)
    await get().loadDir(p)
  },

  async loadDir(path) {
    try {
      const list = await fsApi.listDir(path)
      set((s) => ({ dirs: { ...s.dirs, [path]: list }, expanded: { ...s.expanded, [path]: true } }))
    } catch (e) {
      console.error('读取目录失败', e)
    }
  },

  toggleExpand(path) {
    const open = !get().expanded[path]
    set((s) => ({ expanded: { ...s.expanded, [path]: open } }))
    if (open) void get().loadDir(path)
  },

  async openFile(path, name) {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ active: path })
      return
    }
    const content = await fsApi.readFile(path)
    set((s) => ({
      tabs: [...s.tabs, { path, name, content, savedContent: content, dirty: false }],
      active: path,
    }))
  },

  closeTab(path) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path)
      const tabs = s.tabs.filter((t) => t.path !== path)
      let active = s.active
      if (s.active === path) {
        const next = tabs[idx] || tabs[idx - 1] || null
        active = next ? next.path : null
      }
      return { tabs, active }
    })
  },

  setActive(path) {
    set({ active: path })
  },

  updateContent(path, content) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content, dirty: content !== t.savedContent } : t
      ),
    }))
  },

  async saveActive() {
    const t = get().tabs.find((x) => x.path === get().active)
    if (!t || !t.dirty) return
    await fsApi.writeFile(t.path, t.content)
    set((s) => ({
      tabs: s.tabs.map((x) =>
        x.path === t.path ? { ...x, savedContent: x.content, dirty: false } : x
      ),
    }))
  },

  async newFile() {
    const root = get().rootPath
    if (!root) return
    const sep = isTauri ? '\\' : '/'
    let name = 'untitled.md'
    let i = 1
    const exists = (n: string) =>
      get().tabs.some((t) => t.name === n) ||
      (get().dirs[root]?.some((d) => d.name === n) ?? false)
    while (exists(name)) name = `untitled-${i++}.md`
    const path = root + sep + name
    await fsApi.writeFile(path, `# ${name}\n\n`)
    await get().loadDir(root)
    await get().openFile(path, name)
  },

  setPreviewHtml(html) {
    set({ previewHtml: html })
  },
}))

function rootNameOf(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}
