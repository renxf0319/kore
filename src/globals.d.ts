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
