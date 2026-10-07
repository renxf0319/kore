import type { FileNode } from './types'
import { isSupportedFile, SUPPORTED_EXTS, unsupportedMessage } from './filetype'

// 双模文件系统桥：
//  - Tauri 模式：通过 Rust 原生命令读写本地磁盘（window.__TAURI_INTERNALS__ 存在时）
//  - 浏览器模式：用 File System Access API 直接读写用户选择的本地文件夹
// 两种模式下对上层暴露完全一致的接口，应用代码无需关心运行环境。
export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

// ----------------------- 浏览器模式（File System Access API） -----------------------
let rootHandle: FileSystemDirectoryHandle | null = null
// 「打开单个文件 / 另存为」得到的文件句柄。key 是虚拟路径（此时就是文件名本身）。
// 没有它就无法在没有工作区的情况下保存 —— 浏览器不允许凭路径字符串重新拿到句柄。
const looseFiles = new Map<string, FileSystemFileHandle>()
// 目录选择器同时只能开一个：重复调用会让第二个 Promise 永远挂着，
// Chrome 会把这种页面判定为「没有响应」。
let picking = false

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('kore', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function saveHandle(h: FileSystemDirectoryHandle): Promise<void> {
  const db = await idb()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').put(h, 'root')
  await txDone(tx)
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await idb()
  const tx = db.transaction('kv', 'readonly')
  const req = tx.objectStore('kv').get('root') as IDBRequest<FileSystemDirectoryHandle>
  const p = new Promise<FileSystemDirectoryHandle | null>((res, rej) => {
    req.onsuccess = () => res((req.result as FileSystemDirectoryHandle) ?? null)
    req.onerror = () => rej(req.error)
  })
  await txDone(tx)
  return p
}

async function ensurePerm(): Promise<void> {
  if (!rootHandle) return
  if ((await rootHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    const r = await rootHandle.requestPermission({ mode: 'readwrite' })
    if (r !== 'granted') throw new Error('未授予文件夹读写权限')
  }
}

function segs(p: string): string[] {
  return p.split('/').filter(Boolean)
}

// 浏览器模式没有真正的绝对路径，统一用「虚拟路径」：
//   根 === root.name（例如 "gateway"），子项一律拼成 "gateway/gateway/技术方案"。
// 于是路径的第一段**永远**是根名。解析时先剥掉这一段，剩下的才是相对段。
// 生成与解析必须共用这一条规则 —— 之前生成子项时漏掉了根名前缀，
// 导致解析时按字符串长度硬切，切出的相对路径是错的（展开子目录会报找不到目录）。
function relParts(root: FileSystemDirectoryHandle, path: string): string[] {
  const parts = segs(path)
  return parts[0] === root.name ? parts.slice(1) : parts
}

async function dirAt(
  root: FileSystemDirectoryHandle,
  parts: string[]
): Promise<FileSystemDirectoryHandle> {
  let h = root
  for (const part of parts) h = await h.getDirectoryHandle(part)
  return h
}

async function browserList(path: string): Promise<FileNode[]> {
  await ensurePerm()
  const root = rootHandle!
  const handle = await dirAt(root, relParts(root, path))
  const out: FileNode[] = []
  for await (const [name, entry] of handle.entries()) {
    out.push({
      name,
      path: `${path}/${name}`,
      isDir: entry.kind === 'directory',
    })
  }
  out.sort((a, b) =>
    b.isDir === a.isDir ? a.name.localeCompare(b.name, 'zh') : b.isDir ? 1 : -1
  )
  return out
}

/**
 * 严格按 UTF-8 解码。
 *
 * `File.text()` 用的是「宽松」解码：遇到非法字节序列不报错，
 * 而是替换成 U+FFFD（�）。对 GBK 编码的中文 .txt / .sql 来说，
 * 结果就是**满屏替换字符** —— 正是需求里要消灭的「乱码」。
 *
 * 这里改用 fatal 模式：解不出就明确抛错，由上层给出「编码不是 UTF-8」的提示，
 * 让用户知道该先转存，而不是对着乱码猜。
 */
async function decodeUtf8(file: File, path: string): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new NotOpenableError(
      `「${baseName(path)}」的编码不是 UTF-8（可能是 GBK 等其它编码），` +
        `请先用文本编辑器转存为 UTF-8`
    )
  }
}

async function browserRead(path: string): Promise<string> {
  // 无工作区时（直接「打开」单个文件），走 looseFiles 句柄
  const loose = looseFiles.get(path)
  if (loose) {
    return decodeUtf8(await loose.getFile(), path)
  }
  await ensurePerm()
  const root = rootHandle!
  const parts = relParts(root, path)
  const fileName = parts.pop()
  if (!fileName) throw new Error('无效的文件路径')
  const dir = await dirAt(root, parts)
  const fh = await dir.getFileHandle(fileName)
  return decodeUtf8(await fh.getFile(), path)
}

async function writeLoose(h: FileSystemFileHandle, content: string): Promise<void> {
  const w = await h.createWritable()
  await w.write(content)
  await w.close()
}

async function browserWrite(path: string, content: string): Promise<void> {
  const loose = looseFiles.get(path)
  if (loose) return writeLoose(loose, content)
  await ensurePerm()
  const root = rootHandle!
  const parts = relParts(root, path)
  const fileName = parts.pop()
  if (!fileName) throw new Error('无效的文件路径')
  const dir = await dirAt(root, parts)
  const fh = await dir.getFileHandle(fileName, { create: true })
  await writeLoose(fh, content)
}

async function browserPick(): Promise<string | null> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (o?: {
        mode?: 'read' | 'readwrite'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker
  if (!picker) {
    throw new Error('当前浏览器不支持 File System Access API（请用 Chrome / Edge 或桌面端）')
  }
  if (picking) throw new Error('目录选择窗口已经打开了，请先在系统窗口里完成选择')
  picking = true
  try {
    const h = await picker({ mode: 'readwrite' })
    if (!h) return null
    rootHandle = h
    await saveHandle(h)
    return h.name
  } finally {
    picking = false
  }
}

// 打开单个文件：返回 { path, name, content }，path 即文件名（虚拟路径）
async function browserOpenFile(): Promise<OpenedFile | null> {
  const picker = (
    window as Window & {
      showOpenFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle[]>
    }
  ).showOpenFilePicker
  if (!picker) {
    throw new Error('当前浏览器不支持打开文件（请用 Chrome / Edge 或桌面端）')
  }
  const [h] = await picker({
    multiple: false,
    types: [
      {
        description: 'Markdown / 纯文本 / SQL / 配置 / YAML',
        accept: { 'text/plain': OPEN_EXTS },
      },
    ],
  })
  if (!h) return null
  const name = h.name
  // 与桌面端同款闸门：picker 的 accept 只是「默认筛选」，
  // 用户仍可在某些平台手动改过滤条件或输入别的文件名。
  assertSupported(name)
  // 严格 UTF-8：GBK 文本用 File.text() 会解出一屏 �
  const content = await decodeUtf8(await h.getFile(), name)
  looseFiles.set(name, h)
  return { path: name, name, content }
}

// 另存为：用户选好落点后把句柄存起来，后续保存走同一个句柄
async function browserSaveAs(suggestedName: string): Promise<string | null> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle>
    }
  ).showSaveFilePicker
  if (!picker) {
    throw new Error('当前浏览器不支持另存为（请用 Chrome / Edge 或桌面端）')
  }
  const h = await picker({
    suggestedName: keepExt(suggestedName),
    types: [
      {
        description: 'Markdown / 纯文本 / SQL / 配置 / YAML',
        accept: { 'text/plain': OPEN_EXTS },
      },
    ],
  })
  const name = h.name
  looseFiles.set(name, h)
  return name
}

/**
 * 另存为的建议文件名：**保留原有的受支持扩展名**。
 * 之前是无条件改成 `.md`，于是「打开 a.sql → 另存为」会把文件类型悄悄换掉，
 * 这在支持多类型之后是明确的 bug：用户以为存成了 .sql，实际拿到 .md。
 * 没有受支持的扩展名时才回落 `.md`（新文档的默认）。
 */
function keepExt(name: string): string {
  return isSupportedFile(name) ? name : `${name}.md`
}

/** Rust `FileEntry` 的原始形状：字段名是 snake_case */
interface RustFileEntry {
  name: string
  path: string
  is_dir?: boolean
  isDir?: boolean
}

/**
 * 「这个文件打不开，但原因不是程序出错」专用错误。
 *
 * 覆盖两种情况：
 *  - 类型不在白名单内（.class / .png / .jar）
 *  - 类型合法但内容不是 UTF-8 文本（GBK 编码的 .txt、被改成 .txt 的 .exe）
 *
 * 单独一个类型而不是普通 Error，是为了在 store 里把它渲染成中性提示（info）
 * 而不是红色报错条 —— 前者说的是「不在支持范围内」，后者说的是「程序坏了」，
 * 后者对用户毫无帮助，还容易让人以为要重装。
 */
export class NotOpenableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotOpenableError'
  }
}

/** 类型闸门：读盘之前先问一次白名单 */
function assertSupported(nameOrPath: string): void {
  if (!isSupportedFile(nameOrPath)) throw new NotOpenableError(unsupportedMessage(nameOrPath))
}

/** 系统「打开文件」对话框的过滤器：一次列出全部受支持类型 */
function openFilters() {
  return [
    { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
    { name: '纯文本', extensions: ['txt', 'text', 'log'] },
    { name: 'SQL', extensions: ['sql'] },
    { name: '配置', extensions: ['conf', 'cfg', 'ini', 'properties'] },
    { name: 'YAML', extensions: ['yaml', 'yml'] },
    { name: 'JSON / XML / TOML', extensions: ['json', 'xml', 'toml'] },
  ]
}

/** File System Access API 的 accept 只认 MIME → 扩展名，这里统一映射到 text/plain。
 *  真实白名单仍由 filetype.ts 决定，这个数组只是给对话框做「默认筛选」用的。 */
const OPEN_EXTS = SUPPORTED_EXTS.map((e) => `.${e}`)

// ----------------------- Tauri 模式（Rust 原生命令） -----------------------
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

async function tauriPick(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const r = await open({ directory: true, multiple: false })
  return typeof r === 'string' ? r : null
}

async function tauriOpenFile(): Promise<OpenedFile | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const r = await open({ multiple: false, filters: openFilters() })
  if (typeof r !== 'string') return null
  // 先判类型再读盘：对话框可以被改成「所有文件」，也可以手输文件名
  assertSupported(r)
  const content = await tauriInvoke<string>('read_file', { path: r })
  return { path: r, name: baseName(r), content }
}

async function tauriSaveAs(suggestedPath: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const r = await save({
    defaultPath: keepExt(suggestedPath),
    filters: openFilters(),
  })
  return r ?? null
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function dirName(p: string): string {
  const parts = p.split(/[\\/]/)
  parts.pop()
  return parts.join(isTauri ? '\\' : '/')
}

// 一个已读入的文件
export interface OpenedFile {
  path: string
  name: string
  content: string
}

// ----------------------- 统一 API -----------------------
export const fsApi = {
  async pickFolder(): Promise<string | null> {
    if (isTauri) return tauriPick()
    return browserPick()
  },

  async listDir(path: string): Promise<FileNode[]> {
    if (isTauri) {
      const raw = await tauriInvoke<RustFileEntry[]>('read_dir', { path })
      // 归一化：Rust 侧字段名一旦改动（is_dir ↔ isDir），这里兜住。
      // 不加这层的话，字段名不匹配会让 isDir 变成 undefined，
      // 所有子目录被当成文件，点击就去 read_file 一个目录 → Windows os error 5，
      // 表现为「文件夹点不开」且**没有任何前端报错指向真正原因**，极难定位。
      return raw.map((r) => ({
        name: r.name,
        path: r.path,
        isDir: Boolean(r.isDir ?? r.is_dir),
      }))
    }
    if (!rootHandle) throw new Error('未选择文件夹')
    return browserList(path)
  },

  async readFile(path: string): Promise<string> {
    // 兜底闸门：调用方（store）已经判过一次，但这是所有读盘的唯一出口，
    // 在这里再挡一次才能保证「不支持的类型」永远不会走到解码那一步。
    assertSupported(path)
    if (isTauri) return tauriInvoke<string>('read_file', { path })
    if (!rootHandle && !looseFiles.has(path)) throw new Error('未选择文件夹或文件')
    return browserRead(path)
  },

  async writeFile(path: string, content: string): Promise<void> {
    if (isTauri) return tauriInvoke<void>('write_file', { path, contents: content })
    if (!rootHandle && !looseFiles.has(path)) throw new Error('未选择文件夹或文件')
    return browserWrite(path, content)
  },

  // 打开单个文件（不要求先有工作区）
  async openFile(): Promise<OpenedFile | null> {
    if (isTauri) return tauriOpenFile()
    return browserOpenFile()
  },

  // 另存为：返回最终落盘路径（已确保 .md 扩展名），用户取消返回 null
  async saveAs(suggestedName: string): Promise<string | null> {
    if (isTauri) return tauriSaveAs(suggestedName)
    return browserSaveAs(suggestedName)
  },

  // 供「打开」单个文件后，把所在目录登记为当前工作区（仅桌面端有意义）
  async adoptParentOf(path: string): Promise<void> {
    if (isTauri) {
      const d = dirName(path)
      if (d) localStorage.setItem('kore-root', d)
    }
  },

  // 启动时尝试恢复上次打开的文件夹。
  // granted=false 表示句柄还在、但本页尚未获得读写授权 —— 浏览器安全模型要求
  // 由用户手势触发重新授权，所以这里先把状态报给上层，由界面给出「重新授权」入口。
  async restore(): Promise<{ name: string; granted: boolean } | null> {
    if (isTauri) {
      const p = localStorage.getItem('kore-root')
      return p ? { name: p, granted: true } : null
    }
    const h = await loadHandle()
    if (!h) return null
    rootHandle = h
    let granted = false
    try {
      granted = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'
    } catch {
      granted = false
    }
    return { name: h.name, granted }
  },

  // 重新申请授权（必须由用户手势调用，例如按钮点击）
  async regrant(): Promise<boolean> {
    if (isTauri) return true
    if (!rootHandle) return false
    try {
      return (await rootHandle.requestPermission({ mode: 'readwrite' })) === 'granted'
    } catch {
      return false
    }
  },

  // 当前是否有已恢复但未授权的目录
  hasRestoredHandle(): boolean {
    return !isTauri && rootHandle !== null
  },

  // 丢弃已保存的目录句柄（恢复流程出问题时的手动逃生口）
  async forgetRoot(): Promise<void> {
    rootHandle = null
    if (isTauri) {
      localStorage.removeItem('kore-root')
      return
    }
    try {
      const db = await idb()
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').delete('root')
      await txDone(tx)
    } catch {
      /* 存储不可用时忽略：下一次打开自然也不会恢复 */
    }
  },

  async persistRoot(path: string): Promise<void> {
    if (isTauri) localStorage.setItem('kore-root', path)
  },
}
