import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { exportHtml, exportPdf } from '../lib/export'
import { newWindow, shortcutOf } from '../lib/commands'
import { checkUpdate, openExternal, RELEASES_PAGE } from '../lib/updater'

type MenuKey = 'file' | 'theme' | 'about' | null

interface Item {
  label?: string
  onSelect?: () => void
  children?: Item[]
  checked?: boolean
  danger?: boolean
  sep?: boolean
  /** 灰显不可点（纯信息展示，如版本号）。仍会占位，保证对齐 */
  disabled?: boolean
  /** 关联 commands.ts 里的命令 id；用于自动渲染右侧快捷键提示 */
  cmdId?: string
}

// 关键：React 18 把 onClick 委托在 **#root 容器**上，而不是 document。
// 于是同一次点击里「祖先冒泡(#root / React 委托)」会早于「目标冒泡(.menu-trigger 的 onClick)」——
// 正是这个反直觉的顺序，决定了「关闭」必须放在 click 冒泡的 document 层、
// 而不能放在更早的 mousedown 里（否则会抢在 onClick 之前把状态改掉）。
//
// Typora 式顶栏：文件 / 主题 / 关于。点击展开，点击任意处或 Esc 收起。
// 已展开时，鼠标滑过其他菜单名会**直接切换**（无需再点一次）。
export default function MenuBar() {
  const [open, setOpen] = useState<MenuKey>(null)
  const barRef = useRef<HTMLDivElement>(null)

  /**
   * 菜单名在 click 时**真正读到的最新的 open**。
   *
   * ⚠️ 为什么必须用 ref 而不是 state：点击菜单名时，如果先把 open 置 null
   * 再让 onClick 去 toggle，onClick 闭包里的 `open` 会是上一次渲染的旧值，
   * 「已展开时点击同一个菜单」就会被判成「本来没开」→ 又打开，
   * 表现为「点一下关不掉、得点两下」。读这个 ref 才拿得到真实状态。
   * （当前实现里 onClick 先跑、不会被抢改，这个 ref 依旧是唯一可靠的读法：
   *   state 的更新是异步的，同一次事件里 back-to-back 的读写必然踩到旧值。）
   */
  const openRef = useRef<MenuKey>(null)
  openRef.current = open

  useEffect(() => {
    if (!open) return

    /**
     * 关闭时机定在 **click（冒泡）**，而不是 mousedown。
     *
     * 这是本次修复的核心要点。原因见文件顶部那段注释：
     * React 18 把 onClick 委托在 #root 上，事件顺序是
     *     .menu-trigger 的 onClick（组件）  →  #root 的委托  →  document（这里）
     * 若把关闭放在更早的 mousedown，它会抢在组件的 onClick 之前改掉 open，
     * 让「点菜单名」这个动作读到过期状态。
     *
     * 关闭条件：**点击没有落在顶栏内部**。
     * 顶栏_内部_的空白（菜单名之间的 padding、图标空隙）刻意**不关** ——
     * 它离菜单名只差几像素，顺手关掉等于「手抖点偏 2px 菜单就没了」，更糟。
     * 菜单项自己会在 onPick 里关闭；点顶栏之外的一切地方（正文、侧栏、状态栏）
     * 都会冒泡到 document，在这里收起。
     */
    const onClick = (e: MouseEvent) => {
      const inBar = Boolean(
        barRef.current && e.target instanceof Node && barRef.current.contains(e.target)
      )
      if (inBar) return
      setOpen(null)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  useEffect(() => {
    // Alt+F / Alt+T / Alt+A 直接展开对应菜单；Esc 收起。
    // 即便菜单当前是关着的也要监听，所以这个 effect 不依赖 open。
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null)
        return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'f') {
        e.preventDefault()
        setOpen('file')
      } else if (k === 't') {
        e.preventDefault()
        setOpen('theme')
      } else if (k === 'a') {
        e.preventDefault()
        setOpen('about')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])


  const run = (fn?: () => void) => {
    setOpen(null)
    fn?.()
  }

  const fileItems = useFileItems()

  /**
   * 菜单名点击：已开则关、未开则开。
   *
   * 读 openRef 而不是闭包里的 open —— state 更新是异步的，
   * 同一次事件里两次 setOpen 的判断必须基于同一个真实值，否则会出现
   * 「点一下该关却关了又开」这种自相矛盾的结果。
   */
  const toggle = (key: Exclude<MenuKey, null>) => {
    setOpen(openRef.current === key ? null : key)
  }

  return (
    <div className="menubar no-print" ref={barRef}>
      <div className="menubar-inner">
        <Menu
          label="文件"
          accelKey="F"
          active={open === 'file'}
          anyOpen={open !== null}
          onToggle={() => toggle('file')}
          onHover={() => setOpen('file')}
        >
          <Items items={fileItems} onPick={run} />
        </Menu>
        <Menu
          label="主题"
          accelKey="T"
          active={open === 'theme'}
          anyOpen={open !== null}
          onToggle={() => toggle('theme')}
          onHover={() => setOpen('theme')}
        >
          <ThemeItems onPick={run} />
        </Menu>
        <Menu
          label="关于"
          accelKey="A"
          active={open === 'about'}
          anyOpen={open !== null}
          onToggle={() => toggle('about')}
          onHover={() => setOpen('about')}
        >
          <AboutItems onPick={run} />
        </Menu>
      </div>
    </div>
  )
}

function Menu({
  label,
  accelKey,
  active,
  anyOpen,
  onToggle,
  onHover,
  children,
}: {
  label: string
  /** 菜单名的记忆键，显示为「文件(F)」，Alt+F 可直接展开 */
  accelKey?: string
  active: boolean
  /** 同级是否有菜单正展开。用来实现「先点开一个，再滑过另一个即切换」 */
  anyOpen: boolean
  onToggle: () => void
  onHover: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="menu-root"
      // 只有**已经展开着**某个菜单时，滑过才切换。
      // 否则鼠标扫过顶栏就会不断弹菜单 —— 那不是用户要的。
      onMouseEnter={() => {
        if (anyOpen) onHover()
      }}
    >
      <button
        className={`menu-trigger${active ? ' open' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={active}
        title={accelKey ? `Alt+${accelKey}` : undefined}
      >
        {label}
        {accelKey && <span className="menu-accel-key">({accelKey})</span>}
      </button>
      {active && (
        <div className="menu-pop no-print" role="menu">
          {children}
        </div>
      )}
    </div>
  )
}

function Items({ items, onPick }: { items: Item[]; onPick: (fn?: () => void) => void }) {
  return (
    <>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="menu-sep" />
        ) : it.children ? (
          <SubMenu key={i} label={it.label ?? ''} items={it.children} onPick={onPick} />
        ) : (
          <button
            key={i}
            className={`menu-item${it.checked ? ' checked' : ''}${it.disabled ? ' disabled' : ''}`}
            role="menuitem"
            // disabled 用 aria 而不是原生 disabled：原生 disabled 会让菜单项
            // 从 tab 序列里消失，键盘用户就再也看不到版本号这一行了
            aria-disabled={it.disabled || undefined}
            onClick={() => {
              if (it.disabled) return
              onPick(it.onSelect)
            }}
          >
            <span className="menu-check">{it.checked ? '✓' : ''}</span>
            <span>{it.label}</span>
            {shortcutOf(it.cmdId) && (
              <span className="menu-accel">{shortcutOf(it.cmdId)}</span>
            )}
          </button>
        )
      )}
    </>
  )
}

function SubMenu({
  label,
  items,
  onPick,
}: {
  label: string
  items: Item[]
  onPick: (fn?: () => void) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className="menu-sub"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button className="menu-item has-sub" role="menuitem">
        <span className="menu-check" />
        <span>{label}</span>
        <span className="menu-arrow">›</span>
      </button>
      {hover && (
        <div className="menu-pop sub no-print" role="menu">
          <Items items={items} onPick={onPick} />
        </div>
      )}
    </div>
  )
}

function ThemeItems({ onPick }: { onPick: (fn?: () => void) => void }) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const items: Item[] = [
    { label: '白色（默认）', checked: theme === 'light', onSelect: () => setTheme('light') },
    { label: '黑色', checked: theme === 'dark', onSelect: () => setTheme('dark') },
  ]
  return <Items items={items} onPick={onPick} />
}

/**
 * 「关于」菜单：版本信息 + 检查更新。
 *
 * 检查更新的三条原则：
 *  1. **立刻给反馈**：点下去马上出「正在检查…」，否则用户分不清是网络慢还是没点上。
 *  2. **结果落到提示条**：复用 store.notice（顶部 Banner），而不是菜单里再开一层浮窗 ——
 *     菜单会在 run() 里关闭，任何写在菜单内部的提示都会跟着消失。
 *  3. **发现新版本要能一键跳下载页**：提示条带 action 按钮，见 Banner.tsx。
 */
function AboutItems({ onPick }: { onPick: (fn?: () => void) => void }) {
  const setNotice = useStore((s) => s.setNotice)
  const mode = useStore((s) => s.mode)

  const items: Item[] = [
    { label: `Kore ${__APP_VERSION__}`, disabled: true },
    {
      label: `运行环境：${mode === 'tauri' ? '桌面版' : mode === 'browser' ? '浏览器' : '未知'}`,
      disabled: true,
    },
    { sep: true },
    { label: '检查更新…', onSelect: () => void doCheck(setNotice) },
    { label: '前往下载页', onSelect: () => void openLink(RELEASES_PAGE, setNotice) },
    { sep: true },
    { label: '项目主页', onSelect: () => void openLink(__REPO_URL__, setNotice) },
  ]
  return <Items items={items} onPick={onPick} />
}

/**
 * 打开外部链接；**失败时把链接明文写进提示条**。
 *
 * 桌面端曾因用 `window.open` 而点了完全没反应（详见 lib/updater.ts 的 openExternal）。
 * 就算将来再有环境打不开，至少要让用户看见链接能手动复制 ——
 * 「点了没反应、也不告诉你地址」是最糟的失败方式。
 */
async function openLink(
  url: string,
  setNotice: (n: { kind: 'info' | 'error'; text: string }) => void
): Promise<void> {
  const ok = await openExternal(url)
  if (!ok) setNotice({ kind: 'info', text: `无法自动打开浏览器，请手动访问：${url}` })
}

async function doCheck(
  setNotice: (n: { kind: 'info' | 'error'; text: string; action?: 'release' }) => void
): Promise<void> {
  setNotice({ kind: 'info', text: '正在检查更新…' })
  try {
    const { current, latest, hasUpdate, noRelease } = await checkUpdate()
    if (hasUpdate) {
      setNotice({
        kind: 'info',
        text: `发现新版本 ${latest}（当前 ${current}）`,
        action: 'release',
      })
      return
    }
    setNotice({
      kind: 'info',
      text: noRelease
        ? `当前版本 ${current}（仓库尚未发布正式版本，暂无可比对的新版本）`
        : `已是最新版本 ${current}`,
    })
  } catch (e) {
    // 网络类问题不该报红：用户没做错任何事，红色会让人以为程序出错
    setNotice({
      kind: 'info',
      text: `检查更新失败：${e instanceof Error ? e.message : String(e)}`,
    })
  }
}

function useFileItems(): Item[] {
  const newDoc = useStore((s) => s.newDoc)
  const openFileDialog = useStore((s) => s.openFileDialog)
  const openFolder = useStore((s) => s.openFolder)
  const save = useStore((s) => s.save)
  const saveAs = useStore((s) => s.saveAs)
  const closeDoc = useStore((s) => s.closeDoc)
  const activeTab = useStore((s) => s.activeTab)
  const setNotice = useStore((s) => s.setNotice)
  const theme = useStore((s) => s.theme)

  const doExport = (kind: 'html' | 'pdf') => async () => {
    const t = activeTab()
    if (!t) {
      setNotice({ kind: 'info', text: '没有可导出的文档' })
      return
    }
    try {
      if (kind === 'html') {
        const name = await exportHtml(t.path ?? t.name, t.content, theme)
        setNotice({ kind: 'info', text: `已导出 ${name}` })
      } else {
        await exportPdf(t.path ?? t.name, t.content, theme)
      }
    } catch (e) {
      setNotice({
        kind: 'error',
        text: `导出失败：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return [
    { label: '新建窗口', cmdId: 'file.newWindow', onSelect: newWindow },
    { label: '新建文档', onSelect: () => newDoc() },
    { sep: true },
    { label: '打开…', onSelect: () => void openFileDialog() },
    { label: '打开文件夹…', onSelect: () => void openFolder() },
    { sep: true },
    { label: '保存', cmdId: 'file.save', onSelect: () => void save() },
    { label: '另存为…', cmdId: 'file.saveAs', onSelect: () => void saveAs() },
    {
      label: '导出',
      children: [
        { label: '导出为 PDF…', onSelect: doExport('pdf') },
        { label: '导出为 HTML…', onSelect: doExport('html') },
      ],
    },
    { sep: true },
    // 单文档模式下底部栏不再放关闭按钮，关闭入口挪到这里
    { label: '关闭文档', onSelect: () => closeDoc() },
  ]
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}
