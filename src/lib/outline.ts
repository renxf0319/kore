import type { OutlineItem } from './types'
import { slugify } from './slug'

// 从 Markdown 源码提取标题大纲。
// WYSIWYG 下没有真实 DOM 锚点可跳，所以这里返回**行号**，由 Editor 定位光标并滚动。
// id 仍保留（与 markdown-it-anchor 生成的锚点一致），供导出 HTML / 将来做锚点分享用。
export function extractOutline(src: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false
  let fenceMarker = ''
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      // 记录围栏字符（``` vs ~~~）：``` 内部出现的 ~~~ 不该被当成闭合标记
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1][0]
      } else if (fence[1][0] === fenceMarker) {
        inFence = false
      }
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*\S)\s*#*$/.exec(line)
    if (!m) continue
    const level = m[1].length
    const text = m[2].replace(/#+\s*$/, '').trim()
    if (!text) continue
    items.push({ level, text, id: slugify(text), line: i + 1 })
  }
  return items
}
