// 补全 File System Access API 在部分 TS lib 版本中缺失的类型
interface FileSystemHandle {
  queryPermission(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
  requestPermission(descriptor?: {
    mode?: 'read' | 'readwrite'
  }): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

// 部分 markdown-it 插件暂无官方类型声明
declare module 'markdown-it-task-lists'
declare module 'markdown-it-footnote'

// 由 vite.config.ts 的 `define` 在构建时注入（值来自 package.json）
declare const __APP_VERSION__: string
/** 仓库地址，供「关于」菜单里的更新链接使用 */
declare const __REPO_URL__: string
