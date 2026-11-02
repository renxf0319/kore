// 从 CHANGELOG.md 抽取指定版本的段落，供 CI 写入 GitHub Release。
//
// 用法：node scripts/release-notes.mjs v0.3.17
// 输出：该版本标题之后、下一个 "## ..." 之前的内容；找不到则什么都不输出（退出码 0）。
//
// 约定：CHANGELOG.md 用 "## vX.Y.Z" 作为版本段落标题。
import { readFileSync } from 'node:fs'

const tag = (process.argv[2] || '').trim()
const version = tag.replace(/^v/, '')
if (!version) process.exit(0)

let text = ''
try {
  text = readFileSync('CHANGELOG.md', 'utf8')
} catch {
  process.exit(0)
}

const lines = text.split(/\r?\n/)
const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${esc}(?:\\s|$)`).test(l))
if (start < 0) process.exit(0)

let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s+/.test(lines[i])) {
    end = i
    break
  }
}

const body = lines.slice(start + 1, end).join('\n').trim()
if (body) process.stdout.write(body + '\n')
