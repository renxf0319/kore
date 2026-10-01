import type { ThemeMode } from './types'
import markLight from '../assets/logo-mark-light.png'
import markDark from '../assets/logo-mark-dark.png'
import wordmarkLight from '../assets/logo-wordmark-light.png'
import wordmarkDark from '../assets/logo-wordmark-dark.png'

// 品牌资源由 scripts/gen_logo.py 从设计源图生成，成套两份配色：
// 明色主题用「藏青 + 青」，暗色主题用「近白 + 青」—— 字形完全一致，只换非彩色部分。
// 视图侧只关心当前主题该用哪一张，切换主题时直接换 src 即可。

export function markSrc(theme: ThemeMode): string {
  return theme === 'dark' ? markDark : markLight
}

export function wordmarkSrc(theme: ThemeMode): string {
  return theme === 'dark' ? wordmarkDark : wordmarkLight
}
