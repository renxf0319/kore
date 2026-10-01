import type { FileNode } from './types'

// 双模文件系统桥：
//  - Tauri 模式：通过 Rust 原生命令读写本地磁盘（window.__TAURI_INTERNALS__ 存在时）
//  - 浏览器模式：用 File System Access API 直接读写用户选择的本地文件夹
// 两种模式下对上层暴露完全一致的接口，应用代码无需关心运行环境。
export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

// ----------------------- 浏览器模式（File System Access API） -----------------------
let rootHandle: FileSystemDirectoryHandle | null = null

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

async function dirFrom(
  handle: FileSystemDirectoryHandle,
  rel: string
): Promise<FileSystemDirectoryHandle> {
  let h = handle
  for (const part of segs(rel)) {
    h = await h.getDirectoryHandle(part)
  }
  return h
}

async function browserList(path: string): Promise<FileNode[]> {
  await ensurePerm()
  const root = rootHandle!
  const handle = path === root.name ? root : await dirFrom(root, path.slice(root.name.length))
  const out: FileNode[] = []
  for await (const [name, entry] of handle.entries()) {
    out.push({
      name,
      path: path === root.name ? name : `${path}/${name}`,
      isDir: entry.kind === 'directory',
    })
  }
  out.sort((a, b) =>
    b.isDir === a.isDir ? a.name.localeCompare(b.name, 'zh') : b.isDir ? 1 : -1
  )
  return out
}

async function browserRead(path: string): Promise<string> {
  await ensurePerm()
  const root = rootHandle!
  const parts = segs(path.slice(root.name.length))
  const dir = await dirFrom(root, parts.slice(0, -1).join('/'))
  const fh = await dir.getFileHandle(parts[parts.length - 1])
  const file = await fh.getFile()
  return file.text()
}

async function browserWrite(path: string, content: string): Promise<void> {
  await ensurePerm()
  const root = rootHandle!
  const parts = segs(path.slice(root.name.length))
  const dir = await dirFrom(root, parts.slice(0, -1).join('/'))
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
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
    throw new Error('当前浏览器不支持 File System Access API（请用 Chrome/Edge 或桌面端）')
  }
  const h = await picker({ mode: 'readwrite' })
  if (!h) return null
  rootHandle = h
  await saveHandle(h)
  return h.name
}

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

// ----------------------- 统一 API -----------------------
export const fsApi = {
  async pickFolder(): Promise<string | null> {
    if (isTauri) return tauriPick()
    return browserPick()
  },

  async listDir(path: string): Promise<FileNode[]> {
    if (isTauri) return tauriInvoke<FileNode[]>('read_dir', { path })
    if (!rootHandle) throw new Error('未选择文件夹')
    return browserList(path)
  },

  async readFile(path: string): Promise<string> {
    if (isTauri) return tauriInvoke<string>('read_file', { path })
    if (!rootHandle) throw new Error('未选择文件夹')
    return browserRead(path)
  },

  async writeFile(path: string, content: string): Promise<void> {
    if (isTauri) return tauriInvoke<void>('write_file', { path, contents: content })
    if (!rootHandle) throw new Error('未选择文件夹')
    return browserWrite(path, content)
  },

  // 启动时尝试恢复上次打开的文件夹
  async restore(): Promise<string | null> {
    if (isTauri) return localStorage.getItem('kore-root') || null
    const h = await loadHandle()
    if (h) {
      try {
        rootHandle = h
        return h.name
      } catch {
        return null
      }
    }
    return null
  },

  async persistRoot(path: string): Promise<void> {
    if (isTauri) localStorage.setItem('kore-root', path)
  },
}
