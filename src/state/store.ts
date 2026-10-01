import { create } from 'zustand'
import type { OpenTab, ThemeMode } from '../lib/types'
import { fsApi, isTauri } from '../lib/fs'
import { applyTheme, getStoredTheme } from '../lib/theme'

// 用户可见的提示（取代从前"点什么都没反应"的静默失败）
export interface Notice {
  kind: 'info' | 'error'
  text: string
  // 需要用户手势才能完成的动作，交给界面渲染成按钮
  action?: 'regrant'
}

function errText(e: unknown): string {
  // 浏览器的文件系统 API 抛的都是英文 DOMException，直接显示对用户毫无意义
  if (e instanceof DOMException) {
    switch (e.name) {
      case 'NotFoundError':
        return '找不到该文件或目录（可能已被移动、重命名或删除）'
      case 'NotAllowedError':
        return '浏览器拒绝了该操作'
      case 'SecurityError':
        return '缺少文件夹读写权限，需要重新授权'
      case 'TypeMismatchError':
        return '已存在同名的文件或文件夹'
      case 'InvalidModificationError':
        return '该操作不被允许（目标文件夹非空等）'
      case 'NoModificationAllowedError':
        return '文件被占用或只读'
      case 'QuotaExceededError':
        return '磁盘空间不足'
      case 'AbortError':
        return '操作已取消'
      default:
        return `${e.name}：${e.message}`
    }
  }
  if (e instanceof Error) return e.message
  return String(e)
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

// 恢复上次文件夹是启动路径上唯一可能长时间挂起的操作（IndexedDB 反序列化句柄、
// 浏览器权限数据库异常等）。加超时兜底：宁可这一次不恢复，也不能让页面卡死。
function withTimeout<T>(
  p: Promise<T>,
  ms: number
): Promise<{ value: T | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ value: null, timedOut: true }), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve({ value: v, timedOut: false })
      },
      () => {
        clearTimeout(timer)
        resolve({ value: null, timedOut: false })
      }
    )
  })
}

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
  notice: Notice | null

  init: () => Promise<void>
  setNotice: (n: Notice | null) => void
  regrantRoot: () => Promise<void>
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
  notice: null,

  async init() {
    const theme = getStoredTheme()
    applyTheme(theme)
    const mode = isTauri ? 'tauri' : 'browser'
    set({ theme, mode })

    // 逃生口：地址栏加 ?reset 打开，直接丢弃上次保存的目录句柄。
    // 当恢复流程本身把页面拖死、连界面都点不动时，这是唯一还能用的自救方式。
    if (new URLSearchParams(location.search).has('reset')) {
      await fsApi.forgetRoot()
      set({
        ready: true,
        notice: { kind: 'info', text: '已清除上次打开的文件夹记录，请重新选择目录' },
      })
      return
    }

    try {
      const { value: restored, timedOut } = await withTimeout(fsApi.restore(), 3000)
      if (timedOut) {
        set({
          notice: {
            kind: 'error',
            text: '恢复上次打开的文件夹超时，已跳过。可点击工具栏「打开文件夹」重新选择目录。',
          },
        })
      }
      if (restored) {
        set({ rootPath: restored.name, rootName: rootNameOf(restored.name) })
        if (restored.granted) {
          await get().loadDir(restored.name)
        } else {
          // 句柄还在，但浏览器要求由用户手势重新授权 —— 这在每次新开页面时都会发生，
          // 必须给出明确入口，否则所有文件操作都会静默失败。
          set({
            notice: {
              kind: 'info',
              text: `上次打开的「${restored.name}」需要重新授权才能读写`,
              action: 'regrant',
            },
          })
        }
      }
    } catch (e) {
      set({ notice: { kind: 'error', text: `恢复上次的文件夹失败：${errText(e)}` } })
    }
    set({ ready: true })
  },

  setNotice(n) {
    set({ notice: n })
  },

  async regrantRoot() {
    const ok = await fsApi.regrant()
    if (!ok) {
      set({
        notice: {
          kind: 'error',
          text: '授权未通过。可以点击工具栏「打开文件夹」重新选择目录。',
        },
      })
      return
    }
    const root = get().rootPath
    set({ notice: null })
    if (root) await get().loadDir(root)
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
    try {
      const p = await fsApi.pickFolder()
      if (!p) return
      set({ rootPath: p, rootName: rootNameOf(p), expanded: { [p]: true }, notice: null })
      await fsApi.persistRoot(p)
      await get().loadDir(p)
    } catch (e) {
      if (isAbort(e)) return // 用户在系统窗口里点了取消，不是错误
      set({ notice: { kind: 'error', text: `打开文件夹失败：${errText(e)}` } })
    }
  },

  async loadDir(path) {
    try {
      const list = await fsApi.listDir(path)
      set((s) => ({ dirs: { ...s.dirs, [path]: list }, expanded: { ...s.expanded, [path]: true } }))
    } catch (e) {
      const msg = errText(e)
      if (fsApi.hasRestoredHandle() && /user gesture|权限|Permission/i.test(msg)) {
        set({
          notice: {
            kind: 'info',
            text: `读取「${rootNameOf(path)}」需要重新授权`,
            action: 'regrant',
          },
        })
        return
      }
      set({ notice: { kind: 'error', text: `读取目录失败：${msg}` } })
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
    try {
      const content = await fsApi.readFile(path)
      set((s) => ({
        tabs: [...s.tabs, { path, name, content, savedContent: content, dirty: false }],
        active: path,
        notice: null,
      }))
    } catch (e) {
      set({ notice: { kind: 'error', text: `打开「${name}」失败：${errText(e)}` } })
    }
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
    try {
      await fsApi.writeFile(t.path, t.content)
      set((s) => ({
        tabs: s.tabs.map((x) =>
          x.path === t.path ? { ...x, savedContent: x.content, dirty: false } : x
        ),
      }))
    } catch (e) {
      set({ notice: { kind: 'error', text: `保存「${t.name}」失败：${errText(e)}` } })
    }
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
    try {
      await fsApi.writeFile(path, `# ${name}\n\n`)
      await get().loadDir(root)
      await get().openFile(path, name)
    } catch (e) {
      set({ notice: { kind: 'error', text: `新建文件失败：${errText(e)}` } })
    }
  },

  setPreviewHtml(html) {
    set({ previewHtml: html })
  },
}))

function rootNameOf(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}
