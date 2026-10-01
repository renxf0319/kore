// Markdown 渲染主线程封装：维护一个单例 Worker，按序号丢弃过期请求，
// 保证预览永远展示最新内容（输入飞快时也不会闪烁）。
let worker: Worker | null = null
let seq = 0
let latest = 0
const pending = new Map<number, (html: string) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<{ id: number; html: string }>) => {
      const { id, html } = e.data
      const cb = pending.get(id)
      pending.delete(id)
      if (cb && id === latest) cb(html)
    }
  }
  return worker
}

export function renderMarkdown(src: string): Promise<string> {
  const w = getWorker()
  const id = ++seq
  latest = id
  return new Promise((resolve) => {
    pending.set(id, resolve)
    w.postMessage({ id, src })
  })
}
