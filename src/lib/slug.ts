// 用于 Markdown 标题锚点与大纲的统一 slug 生成（兼容中文）
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
}
