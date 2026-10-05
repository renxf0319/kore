import { fsApi, isTauri } from './fs'
import { renderMarkdown } from './markdown'
import DOMPurify from 'dompurify'
import type { ThemeMode } from './types'

// WYSIWYG 模式下没有常驻的预览面板，导出统一走「现渲染」：
// 把当前 Markdown 源码丢给 Worker 渲染 → 消毒 → 拼自包含文档。
async function renderSafe(src: string): Promise<string> {
  const raw = await renderMarkdown(src)
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

// 导出独立 HTML：桌面端写到源文件同级目录，浏览器端走下载
export async function exportHtml(
  sourceName: string,
  source: string,
  theme: ThemeMode
): Promise<string> {
  const html = await renderSafe(source)
  const doc = buildHtmlDoc(html, theme)
  if (isTauri && sourceName.includes('\\')) {
    const out = sourceName.replace(/\.md$/i, '') + '.html'
    await fsApi.writeFile(out, doc)
    return out
  }
  const name = outName(sourceName)
  download(name, doc, 'text/html;charset=utf-8')
  return name
}

// 导出 PDF：先把渲染结果塞进隐藏的 print-root，再调系统打印对话框「另存为 PDF」
export async function exportPdf(
  source: string,
  theme: ThemeMode
): Promise<void> {
  const html = await renderSafe(source)
  injectPrintDoc(html, theme)
  // 等一帧，确保浏览器已经完成布局再进打印
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  window.print()
}

// 打印专用容器：屏幕上 display:none，@media print 下才显示并隐藏应用其余部分
function injectPrintDoc(html: string, theme: ThemeMode): void {
  let el = document.getElementById('kore-print-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'kore-print-root'
    document.body.appendChild(el)
  }
  el.setAttribute('data-theme', theme)
  el.innerHTML = html
}

function buildHtmlDoc(html: string, theme: ThemeMode): string {
  const bg = theme === 'dark' ? '#1b1f27' : '#ffffff'
  const fg = theme === 'dark' ? '#e6edf3' : '#1f2328'
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kore 导出</title>
<style>
  :root { color-scheme: ${theme}; }
  body { max-width: 820px; margin: 40px auto; padding: 0 24px; background: ${bg}; color: ${fg};
    font: 16px/1.7 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  pre { background: ${theme === 'dark' ? '#161b22' : '#f6f8fa'}; padding: 14px; border-radius: 8px; overflow:auto; }
  code { font-family: "SFMono-Regular", Consolas, monospace; }
  blockquote { border-left: 4px solid #4f46e5; margin: 0; padding: 0 16px; color: ${theme === 'dark' ? '#8b949e' : '#656d76'}; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid ${theme === 'dark' ? '#30363d' : '#d0d7de'}; padding: 6px 10px; }
  img { max-width: 100%; }
  a { color: #4f46e5; }
  .anchor-link { opacity: .35; text-decoration: none; margin-right: 6px; }
  h1, h2, h3 { scroll-margin-top: 20px; }
</style>
</head>
<body>
${html}
</body>
</html>`
}

function outName(p: string): string {
  const base = p.split(/[\\/]/).pop() || 'document.md'
  return base.replace(/\.(md|markdown|txt)$/i, '') + '.html'
}

function download(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
