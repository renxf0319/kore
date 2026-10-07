import { create } from 'zustand'
import type { OpenTab, SidePane, ThemeMode } from '../lib/types'
import { fsApi, isTauri, NotOpenableError } from '../lib/fs'
import { applyTheme, getStoredTheme } from '../lib/theme'
import { isSupportedFile, unsupportedMessage } from '../lib/filetype'

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

/**
 * 判断「读取失败」是不是因为目标其实是目录。
 * Windows 上对目录调 read_to_string 会得到 os error 5（ERROR_ACCESS_DENIED），
 * 但同一条错误信息也可能来自真正的权限问题，所以这里只做保守判断：
 * 仅当错误文本里出现目录相关的中文提示或明确的 access denied 且路径无扩展名时才算。
 */
function isDirectoryError(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return /不是文件|是文件夹|is a directory|EISDIR/i.test(t)
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

let untitledSeq = 0

interface AppState {
  theme: ThemeMode
  mode: 'tauri' | 'browser' | 'unknown'
  rootPath: string | null
  rootName: string | null
  expanded: Record<string, boolean>
  dirs: Record<string, { name: string; path: string; isDir: boolean }[]>
  /** 是否显示白名单之外的其它文件（默认 false：只列出可编辑的纯文本类型） */
  showAllFiles: boolean
  tabs: OpenTab[]
  /** 当前激活标签的 id（不是 path —— 未命名文档没有 path） */
  active: string | null
  ready: boolean
  notice: Notice | null
  /** 左侧栏当前页签：文件 / 大纲 */
  pane: SidePane
  /** 左侧栏是否展开；折叠后主区占满 */
  sidebarOpen: boolean
  /** 左侧栏宽度（px），可由侧栏右缘的竖线拖动调整 */
  sidebarW: number
  /** 大纲跳转请求：目标行号，由 Editor 消费后清空 */
  jumpLine: number | null

  init: () => Promise<void>
  setNotice: (n: Notice | null) => void
  regrantRoot: () => Promise<void>
  setTheme: (t: ThemeMode) => void
  setPane: (p: SidePane) => void
  toggleSidebar: () => void
  setSidebar: (open: boolean) => void
  setSidebarW: (w: number) => void
  setJumpLine: (n: number | null) => void
  setShowAllFiles: (v: boolean) => void

  newDoc: () => void
  openFileDialog: () => Promise<void>
  openFolder: () => Promise<void>
  loadDir: (path: string) => Promise<void>
  toggleExpand: (path: string) => void
  openFile: (path: string, name: string) => Promise<void>
  closeDoc: () => void
  updateContent: (id: string, content: string) => void
  save: () => Promise<void>
  saveAs: () => Promise<void>
  activeTab: () => OpenTab | null

  // --- 单文档切换的未保存拦截 ---
  /** 待确认的切换动作；非 null 时对话框显示「保存 / 放弃 / 取消」 */
  pendingSwitch: (() => void) | null
  /** 切换前的统一入口：当前文档有未保存改动时挂起动作，否则直接执行 */
  guard: (action: () => void) => void
  /** 关闭当前文档（走拦截） */
  requestClose: () => void
  /** 放弃未保存改动，直接执行待切换动作 */
  resolveDiscard: () => void
  /** 取消切换 */
  cancelSwitch: () => void
}

/**
 * 左侧栏宽度：拖动竖线可调，持久化到 localStorage。
 * 范围限制在 [140, 520]：小于 140px 文件名几乎不可读，大于 520px
 * 编辑区会被压得比侧栏还窄，失去主次。
 */
const SIDEBAR_W_MIN = 140
const SIDEBAR_W_MAX = 520
const SIDEBAR_W_DEFAULT = 196
const SIDEBAR_W_KEY = 'kore-sidebar-w'

/** 「显示全部文件」开关的持久化 key */
const SHOW_ALL_KEY = 'kore-show-all-files'

function readShowAll(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_KEY) === '1'
  } catch {
    return false
  }
}

function clampSidebarW(w: number): number {
  return Math.round(Math.min(SIDEBAR_W_MAX, Math.max(SIDEBAR_W_MIN, w)))
}

function readSidebarW(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_W_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? clampSidebarW(n) : SIDEBAR_W_DEFAULT
  } catch {
    // 隐私模式下 localStorage 可能抛异常，用默认值即可
    return SIDEBAR_W_DEFAULT
  }
}

/**
 * 单文档模式：`tabs` 永远只有 0 或 1 个元素。
 * 保留数组结构是为了让 Editor / StatusBar / FileTree 的取值逻辑不必大改，
 * 但**不要**再往里 push 第二个文档。
 */
function single(doc: OpenTab | null): Pick<AppState, 'tabs' | 'active'> {
  return { tabs: doc ? [doc] : [], active: doc ? doc.id : null }
}

/**
 * 造一个空的未命名文档（Typora 启动时的样子）。
 * `id` 用时间戳 + 递增序号，保证同一毫秒内连续新建也不会撞 key。
 */
function makeBlank(): OpenTab {  untitledSeq += 1
  return {
    id: `untitled-${Date.now()}-${untitledSeq}`,
    path: null,
    name: '未命名',
    content: '',
    savedContent: '',
    dirty: false,
  }
}

export const useStore = create<AppState>((set, get) => ({
  theme: 'light',
  mode: 'unknown',
  rootPath: null,
  rootName: null,
  expanded: {},
  dirs: {},
  showAllFiles: readShowAll(),
  tabs: [],
  active: null,
  ready: false,
  notice: null,
  pane: 'files',
  sidebarOpen: true,
  sidebarW: readSidebarW(),
  jumpLine: null,
  pendingSwitch: null,

  async init() {
    const theme = getStoredTheme()
    applyTheme(theme)
    const mode = isTauri ? 'tauri' : 'browser'
    set({ theme, mode })

    // 逃生口：地址栏加 ?reset 打开，直接丢弃上次保存的目录句柄。
    // 当恢复流程本身把页面拖死、连界面都点不动时，这是唯一还能用的自救方式。
    if (new URLSearchParams(location.search).has('reset')) {
      await fsApi.forgetRoot()
      set(single(makeBlank()))
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
    // 启动即备好一个空的未命名文档（Typora 的行为）：
    // 右侧编辑区一进来就是可输入的光标，而不是欢迎页 ——
    // 「打开文件」应该是主动选择的结果，而不是进入编辑器的前提。
    set(single(makeBlank()))
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

  setPane(p) {
    // 侧栏显隐只有一个入口：底部栏左下角的按钮（用户指定）。
    // 这里只负责切页签，不再做「再点一次=折叠」的隐式折叠。
    set({ pane: p, sidebarOpen: true })
  },

  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }))
  },

  setSidebar(open) {
    set({ sidebarOpen: open })
  },

  setSidebarW(w) {
    const sidebarW = clampSidebarW(w)
    set({ sidebarW })
    try {
      localStorage.setItem(SIDEBAR_W_KEY, String(sidebarW))
    } catch {
      // 存不上不影响本次会话使用，只是下次启动不留存
    }
  },

  setJumpLine(n) {
    set({ jumpLine: n })
  },

  setShowAllFiles(v) {
    set({ showAllFiles: v })
    try {
      localStorage.setItem(SHOW_ALL_KEY, v ? '1' : '0')
    } catch {
      /* 存不上不影响本次会话使用 */
    }
    // dirs 里缓存的是过滤后的结果，切换后必须重读，否则开关看起来「没反应」。
    // 只重读已经加载过的目录（值可能为 null 表示正在加载，跳过避免并发覆盖）。
    const loaded = Object.keys(get().dirs).filter((p) => get().dirs[p] !== undefined)
    for (const p of loaded) void get().loadDir(p)
  },

  // --- 未保存拦截 -----------------------------------------------------------
  // 所有会「丢弃当前文档」的动作（新建/打开/关闭）都先过这里。
  // 有未保存改动时把动作挂起，交给对话框的「保存 / 放弃 / 取消」决定。
  guard(action: () => void) {
    const cur = get().activeTab()
    if (cur?.dirty) {
      set({ pendingSwitch: action })
      return
    }
    action()
  },

  requestClose() {
    // 关掉最后一个文档后补一个空白文档，编辑区不退回欢迎页 ——
    // 与 Typora 一致：任何时刻都有一个可输入的编辑区。
    get().guard(() => set(single(makeBlank())))
  },

  resolveDiscard() {
    const act = get().pendingSwitch
    set({ pendingSwitch: null })
    act?.()
  },

  cancelSwitch() {
    set({ pendingSwitch: null })
  },

  // 新建空白文档：不碰磁盘，直接进编辑态，保存时再问存哪
  newDoc() {
    get().guard(() => set(single(makeBlank())))
  },

  async openFileDialog() {
    // 先弹系统对话框选文件，拿到结果后再走拦截 —— 顺序反了会让用户
    // 先选完文件才发现要处理上一个文档的未保存内容。
    let f
    try {
      f = await fsApi.openFile()
    } catch (e) {
      if (isAbort(e)) return
      // 「打不开但不是程序坏了」不是故障：用中性提示，
      // 红色报错会让人以为程序出错，而用户其实只需要知道下一步该做什么
      if (e instanceof NotOpenableError) {
        set({ notice: { kind: 'info', text: e.message } })
        return
      }
      set({ notice: { kind: 'error', text: `打开文件失败：${errText(e)}` } })
      return
    }
    if (!f) return
    // 与文件树入口同款闸门：系统对话框可能被用户切成「所有文件」，
    // 或者在「文件名」框里手输一个 .pdf。这里再挡一次，
    // 保证「不支持的类型」永远是提示，而不是读盘失败或乱码。
    if (!isSupportedFile(f.name)) {
      set({ notice: { kind: 'info', text: unsupportedMessage(f.name) } })
      return
    }
    get().guard(async () => {
      set(single({ id: `file-${f.path}`, path: f.path, name: f.name, content: f.content, savedContent: f.content, dirty: false }))
      // 桌面端把工作区切到该文件所在目录，侧栏文件树跟着走
      if (isTauri) await fsApi.adoptParentOf(f.path)
    })
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
      // 只展示受支持的纯文本类型（目录始终保留，否则无法进入子目录）。
      // 关掉「显示全部文件」时，白名单外的条目直接不出现在树里 ——
      // 让用户点到一个 .class / .png 只会得到一句「不支持」，不如根本不列。
      const showAll = get().showAllFiles
      const visible = showAll
        ? list
        : list.filter((n) => n.isDir || isSupportedFile(n.name))
      set((s) => ({ dirs: { ...s.dirs, [path]: visible }, expanded: { ...s.expanded, [path]: true } }))
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
    // 点当前正打开的同一文件：什么都不用做，更不该弹未保存提示
    if (get().activeTab()?.path === path) return
    // 类型闸门放在**读盘之前**：白名单外的文件不进入 read_file。
    // 否则 .class / .png 会被当 UTF-8 解，要么报「流中没有有效 UTF-8」这种
    // 让人一头雾水的底层错误，要么在某些环境下解出一屏乱码。
    if (!isSupportedFile(name)) {
      set({ notice: { kind: 'info', text: unsupportedMessage(name) } })
      return
    }
    let content: string
    try {
      content = await fsApi.readFile(path)
    } catch (e) {
      // 兜底：把「这是个目录」翻译成人话。
      // 不加这层时，用户看到的是 `os error 5 拒绝访问`，
      // 既看不出是哪个文件、也不知道该点「展开」而不是「打开」。
      if (isDirectoryError(e)) {
        set({ notice: { kind: 'info', text: `「${name}」是文件夹，请点击左侧箭头展开` } })
        return
      }
      // 打不开但不是程序坏了（编码不是 UTF-8 等）：中性提示即可，
      // 文案本身已经说明了该做什么，不需要再套一层「打开失败：」
      if (e instanceof NotOpenableError) {
        set({ notice: { kind: 'info', text: e.message } })
        return
      }
      // Rust 侧（桌面端）用 Err(String) 返回，拿不到错误类型。
      // 它的编码提示已自带「无法打开…请转存为 UTF-8」，
      // 这里按文案特征识别，避免又被套上「打开失败：」前缀变成红色报错。
      const raw = errText(e)
      if (/转存为 UTF-8|不是 UTF-8/.test(raw)) {
        set({ notice: { kind: 'info', text: raw } })
        return
      }
      set({ notice: { kind: 'error', text: `打开「${name}」失败：${raw}` } })
      return
    }
    get().guard(() => {
      set(single({ id: `file-${path}`, path, name, content, savedContent: content, dirty: false }))
    })
  },

  closeDoc() {
    get().requestClose()
  },

  updateContent(id, content) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: content !== t.savedContent } : t
      ),
    }))
  },

  activeTab() {
    const s = get()
    return s.tabs.find((t) => t.id === s.active) ?? null
  },

  // 保存：有路径直接写盘；无路径（未命名文档）自动转入另存为
  async save() {
    const t = get().activeTab()
    if (!t) return
    if (!t.path) {
      await get().saveAs()
      return
    }
    if (!t.dirty) return
    try {
      await fsApi.writeFile(t.path, t.content)
      set((s) => ({
        tabs: s.tabs.map((x) =>
          x.id === t.id ? { ...x, savedContent: x.content, dirty: false } : x
        ),
      }))
    } catch (e) {
      set({ notice: { kind: 'error', text: `保存「${t.name}」失败：${errText(e)}` } })
    }
  },

  async saveAs() {
    const t = get().activeTab()
    if (!t) return
    try {
      // 桌面端给绝对路径做建议名，浏览器端用文件名（此时没有真实路径）
      const suggested = t.path ?? t.name
      const p = await fsApi.saveAs(suggested)
      if (!p) return // 用户取消
      const name = rootNameOf(p)
      const id = `file-${p}`
      set((s) => ({
        tabs: s.tabs.map((x) =>
          x.id === t.id
            ? { ...x, id, path: p, name, savedContent: x.content, dirty: false }
            : x
        ),
        active: id,
      }))
    } catch (e) {
      if (isAbort(e)) return
      set({ notice: { kind: 'error', text: `另存为失败：${errText(e)}` } })
    }
  },
}))

function rootNameOf(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}
