import { fsApi, isTauri } from './fs'
import type { ThemeMode } from './types'

// 导出独立 HTML 文档（内嵌样式，脱离应用也能正常阅读/分享）
export async function exportHtml(
  sourcePath: string,
  html: string,
  theme: ThemeMode
): Promise<void> {
  const doc = buildHtmlDoc(html, theme)
  if (isTauri) {
    const out = sourcePath.replace(/\.md$/i, '') + '.html'
    await fsApi.writeFile(out, doc)
  } else {
    const name = outName(sourcePath)
    download(name, doc, 'text/html;charset=utf-8')
  }
}

// 导出 PDF：复用打印样式（@media print 仅显示预览面板），由系统打印对话框“另存为 PDF”
export function exportPdf(): void {
  window.print()
}

function buildHtmlDoc(html: string, theme: ThemeMode): string {
  const bg = theme === 'dark' ? '#1b1f27' : '#ffffff'
  const fg = theme === 'dark' ? '#e6edf3' : '#1f2328'
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Inkwell 导出</title>
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
  const base = p.split('/').pop() || 'document.md'
  return base.replace(/\.md$/i, '') + '.html'
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
