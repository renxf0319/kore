import type { OutlineItem } from './types'
import { slugify } from './slug'

// 从 Markdown 源码提取标题大纲（供右侧导航；id 与渲染锚点一致）
export function extractOutline(src: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false
  for (const line of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*\S)\s*#*$/.exec(line)
    if (!m) continue
    const level = m[1].length
    const text = m[2].replace(/#+\s*$/, '').trim()
    if (!text) continue
    items.push({ level, text, id: slugify(text) })
  }
  return items
}
