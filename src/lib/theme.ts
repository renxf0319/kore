import type { ThemeMode } from './types'

const KEY = 'inkwell-theme'

export function getStoredTheme(): ThemeMode {
  const t = localStorage.getItem(KEY)
  if (t === 'light' || t === 'dark') return t
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode
  localStorage.setItem(KEY, mode)
}

export function initTheme(): void {
  applyTheme(getStoredTheme())
}
