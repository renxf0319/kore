/**
 * 「关于 → 检查更新」的实现。
 *
 * 为什么走 **GitHub Releases API** 而不是 Tauri updater 插件：
 *  1. Tauri updater 需要在 tauri.conf.json 里配置 endpoints + 签名前缀，
 *     且每个平台还要各自的安装包签名密钥；没有这些配置插件会直接报错，
 *     对「只是个 Markdown 编辑器」这种体量是过重的机制。
 *  2. Releases API 是纯 HTTP，浏览器端与桌面端**同一份代码**都能跑，
 *     不用判断 isTauri、不用给两个端写两套逻辑。
 *  3. 失败可降级：网络不通 / 限流时给出明确提示，而不是静默无反应。
 *
 * 已知的边界：GitHub API 对匿名请求限流 60 次/小时，且部分网络环境
 * 访问 api.github.com 不稳定。这些都会走到 catch 分支，给出可操作的提示。
 */

import { isTauri } from './fs'

const RELEASES_API = 'https://api.github.com/repos/renxf0319/kore/releases'
const RELEASES_PAGE = `${__REPO_URL__}/releases/latest`

/** 超时：网络不通时不能无限转圈，8 秒足够完成一次正常请求 */
const TIMEOUT_MS = 8000

export interface UpdateInfo {
  current: string
  latest: string
  hasUpdate: boolean
  /** 仓库尚未发布任何正式版 Release —— 不是错误，只是无可比对的新版本 */
  noRelease?: boolean
}

/** `GET /releases` 返回的单条记录（只取用得到的字段） */
interface ReleaseItem {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
}

/**
 * ⚠️ **必须用 `/releases` 列表接口，不能用 `/releases/latest`。**
 *
 * `/releases/latest` 会**排除所有 pre-release 与 draft**，只有「正式版」才返回。
 * 而本项目的 CI（`.github/workflows/release.yml`）里写着 `prerelease: true`
 * —— 意味着**每一个**发布出去的 Release 都是 pre-release，
 * `/latest` 恒定返回 404，检查更新永远拿不到版本号。
 * （实测：v0.3.6 与 v0.3.5 都是 pre=true，`/latest` → 404，`/releases` → 200。）
 *
 * 列表接口按发布时间倒序返回，所以取第一条即可；
 * 但仍要显式过滤掉 draft（草稿不该被当成可安装的版本）与缺 tag_name 的记录。
 */
function pickLatest(items: ReleaseItem[]): string | null {
  for (const it of items) {
    if (it.draft) continue
    const tag = (it.tag_name ?? '').replace(/^v/i, '')
    if (tag) return tag
  }
  return null
}

/**
 * 比较两个「点分版本号」。
 * 缺失的段按 0 处理，所以 `0.4` 与 `0.4.0` 判为相等。
 * 带预发布后缀（-beta.1 / -rc.2）时，主版本号相同时**认为本地更新**，
 * 避免开发版反复提示「有新版」。
 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => {
    const [core] = v.trim().replace(/^v/i, '').split('-')
    return core.split('.').map((n) => Number.parseInt(n, 10) || 0)
  }
  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/**
 * 用**系统默认浏览器**打开外部链接。
 *
 * ⚠️ 桌面端**不能**用 `window.open()` —— Tauri 的 WebView 不会把它交给系统浏览器，
 * 点了「前往下载」会**毫无反应**（本 bug 的成因）。
 * 正确做法是 opener 插件（Rust 侧 `tauri-plugin-opener` + `opener:default` 权限）。
 *
 * @returns 是否成功打开。false 时调用方应把链接**明文展示**给用户，
 *          让对方能手动复制 —— 打不开又不说链接在哪，是最糟的结果。
 */
export async function openExternal(url: string): Promise<boolean> {
  if (isTauri) {
    try {
      // 动态 import：浏览器模式下这个包根本不会被加载
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
      return true
    } catch (e) {
      console.error('[openExternal] opener 插件打开失败:', e)
      // 刻意**不**降级到 window.open：它在 Tauri 里本来就打不开，
      // 万一返回了个非 null 的窗口对象，还会让我们误报「成功」。
      return false
    }
  }

  // ---- 浏览器模式 ----
  // ⚠️ 不能用 `window.open(url, '_blank', 'noopener')` ——
  // 按规范，带 noopener 时返回值**恒为 null**，会被误判成「打开失败」。
  // 改成不带 noopener 打开，拿到句柄后立刻把 opener 置空（等效的安全性，
  // 且保留了「是否被拦截」这个真实信号：被拦截时返回 null）。
  try {
    const w = window.open(url, '_blank')
    if (!w) return false
    try {
      w.opener = null
    } catch {
      /* 跨源时可能不可写，忽略 */
    }
    return true
  } catch {
    return false
  }
}

/**
 * 检查是否有新版本。
 * 失败时抛出带中文说明的 Error，由调用方转成提示条。
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(RELEASES_API, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub 接口限流，请稍后再试')
    }
    // 仓库不存在 / 已改名时 GitHub 返回 404。
    // （「没有 release」返回的是 200 + 空数组，不是 404 —— 见下方 EMPTY 分支。）
    if (res.status === 404) throw new Error('找不到仓库，请确认网络或仓库地址')
    if (!res.ok) throw new Error(`GitHub 接口返回 ${res.status}`)

    const data = (await res.json()) as ReleaseItem[]
    if (!Array.isArray(data)) throw new Error('GitHub 返回格式异常')
    const latest = pickLatest(data)
    // 一个可用版本都没有（空数组、或全是草稿）
    if (!latest) {
      return { current: __APP_VERSION__, latest: __APP_VERSION__, hasUpdate: false, noRelease: true }
    }
    return {
      current: __APP_VERSION__,
      latest,
      hasUpdate: isNewer(latest, __APP_VERSION__),
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('检查更新超时，请检查网络后重试')
    }
    throw new Error(e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * **应用内更新**：下载 → 校验签名 → 安装 → 重启，全程不离开 Kore。
 *
 * 与 `openExternal(RELEASES_PAGE)`（跳浏览器自己下载）的区别就在这 ——
 * 这是需求里要的「便捷一点」。
 *
 * 几个关键事实：
 *  - 走 Tauri 官方 updater 插件，**签名校验无法关闭**；更新包的签名由 CI 用
 *    私钥生成，客户端用 `tauri.conf.json` 里的公钥校验，防止更新通道被劫持。
 *  - 更新地址是 `plugins.updater.endpoints` 里的静态清单
 *    （`/releases/latest/download/latest.json`，由 tauri-action 自动生成上传）。
 *  - **Windows 上安装时应用会被安装器接管并自动重启**（NSIS 带 `/R`），
 *    所以下面的 `relaunch()` 在 Windows 通常执行不到；macOS / Linux 才靠它。
 *
 * @param onStatus 阶段性文案回调（下载进度也走它），由调用方渲染到提示条。
 *                 失败时抛错，调用方负责提示并给出「去浏览器下载」的退路。
 */
export async function installUpdate(onStatus: (text: string) => void): Promise<void> {
  if (!isTauri) throw new Error('浏览器模式不支持应用内更新，请用桌面版')

  const { check } = await import('@tauri-apps/plugin-updater')
  const { relaunch } = await import('@tauri-apps/plugin-process')

  onStatus('正在获取更新包…')
  const update = await check()
  if (!update) {
    onStatus('已是最新版本，无需更新')
    return
  }

  let downloaded = 0
  let total: number | null = null
  let lastPct = -1

  onStatus(`正在下载 v${update.version}…`)
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') {
      total = e.data.contentLength ?? null
      return
    }
    if (e.event === 'Progress') {
      downloaded += e.data.chunkLength
      // 只在**整数百分比变化**时才更新 UI：下载事件按 chunk 高频触发，
      // 每次 setState 会让提示条疯狂重渲染（文字抖动、看着像卡了）。
      if (total) {
        const pct = Math.floor((downloaded / total) * 100)
        if (pct !== lastPct) {
          lastPct = pct
          onStatus(`正在下载 v${update.version}… ${pct}%`)
        }
      }
      return
    }
    onStatus('下载完成，正在安装…')
  })

  onStatus('正在安装并重启…')
  await relaunch()
}

/** 提示条的最小接口。刻意不直接依赖 store 的类型，免得 lib 与 state 互相引用。 */
export interface NoticeSink {
  (n: {
    kind: 'info' | 'error'
    text: string
    action?: 'regrant' | 'release' | 'update'
  }): void
}

/**
 * 「立即更新」的完整交互：进度写进提示条；**失败退回「去浏览器下载」**。
 *
 * Banner 与「关于」菜单共用这一份 —— 两个入口各写一遍，
 * 迟早会行为漂移（一个改了文案另一个忘了）。
 */
export function runInAppUpdate(setNotice: NoticeSink): void {
  void installUpdate((text) => setNotice({ kind: 'info', text })).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    // 更新失败最常见的原因是网络或清单缺失，此时手动下载仍然可行 ——
    // 所以退回「前往下载」，而不是把用户卡在一条点不动的错误信息上。
    setNotice({
      kind: 'info',
      text: `应用内更新失败：${msg}。可以手动前往下载页更新。`,
      action: 'release',
    })
  })
}

export { RELEASES_PAGE }
