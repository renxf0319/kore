/**
 * 全局命令表：菜单上显示的快捷键文字与实际按键响应**共用这一份定义**，
 * 避免「菜单写着 Ctrl+S、实际按了没反应」这种漂移。
 *
 * 新增快捷键的步骤：
 * 1. 在 COMMANDS 里加一条（id 唯一、accel 唯一）；
 * 2. 菜单项挂上 `cmdId`（见 MenuBar.tsx），右键提示会自动渲染快捷键文字。
 */
import { useStore } from '../state/store'

export interface Accel {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Command {
  id: string
  /** 面向用户展示的按键文本，如 Ctrl+Shift+N */
  accel: Accel
  run: () => void
}

/** 把 Accel 渲染成菜单右侧的提示文字 */
export function accelText(a: Accel): string {
  const parts: string[] = []
  if (a.ctrl) parts.push('Ctrl')
  if (a.alt) parts.push('Alt')
  // Shift 放在最后，符合 Windows 惯例的书写顺序（Ctrl+Shift+N）
  if (a.shift) parts.push('Shift')
  parts.push(keyLabel(a.key))
  return parts.join('+')
}

function keyLabel(key: string): string {
  switch (key) {
    case ' ':
      return 'Space'
    case 'ArrowUp':
      return '↑'
    case 'ArrowDown':
      return '↓'
    case 'ArrowLeft':
      return '←'
    case 'ArrowRight':
      return '→'
    default:
      return key.length === 1 ? key.toUpperCase() : key
  }
}

/** 新建窗口：桌面端开新的 Tauri Webview 窗口，浏览器端开新标签页 */
export function newWindow(): void {
  if (window.__TAURI_INTERNALS__) {
    void import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      const label = `kore-${Date.now()}`
      new WebviewWindow(label, {
        url: 'index.html',
        title: 'Kore',
        width: 1200,
        height: 800,
      })
    })
    return
  }
  window.open(location.href, '_blank')
}

export const COMMANDS: Command[] = [
  {
    id: 'file.newWindow',
    accel: { key: 'n', ctrl: true, shift: true },
    run: newWindow,
  },
  {
    id: 'file.save',
    accel: { key: 's', ctrl: true },
    run: () => {
      void useStore.getState().save()
    },
  },
  {
    id: 'file.saveAs',
    accel: { key: 's', ctrl: true, shift: true },
    run: () => {
      void useStore.getState().saveAs()
    },
  },
]

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]))

/** 菜单渲染用：取某个命令的快捷键文字，没有则返回 undefined */
export function shortcutOf(cmdId?: string): string | undefined {
  if (!cmdId) return undefined
  return BY_ID.get(cmdId) ? accelText(BY_ID.get(cmdId)!.accel) : undefined
}

/** 把键盘事件规整成 'ctrl+shift+n' 这样的判定串 */
function comboOf(e: KeyboardEvent): string {
  const mods = [
    e.ctrlKey || e.metaKey ? 'ctrl' : '', // mac 上 Cmd 也当 ctrl
    e.shiftKey ? 'shift' : '',
    e.altKey ? 'alt' : '',
  ].filter(Boolean)
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return [...mods, key].join('+')
}

/**
 * 判断这次按键命中了哪条命令。返回 null 表示没命中。
 * 单独导出便于测试和调试。
 */
export function matchCommand(e: KeyboardEvent): Command | null {
  const combo = comboOf(e)
  return COMMANDS.find((c) => {
    const a = c.accel
    const mods = [
      (a.ctrl ? 'ctrl' : ''),
      (a.shift ? 'shift' : ''),
      (a.alt ? 'alt' : ''),
    ]
      .filter(Boolean)
      .join('+')
    const key = a.key.length === 1 ? a.key.toLowerCase() : a.key
    const target = [...(mods ? [mods] : []), key].join('+')
    return target === combo
  }) ?? null
}

/**
 * 装全局快捷键。在 App 挂载时调用一次。
 *
 * 注意：
 * - 命中后会 preventDefault，拦掉浏览器自带的 Ctrl+S「另存网页」；
 * - 菜单输入框里不拦截浏览器行为之外的按键，避免影响正常输入。
 */
export function installHotkeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const cmd = matchCommand(e)
    if (!cmd) return
    e.preventDefault()
    cmd.run()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}