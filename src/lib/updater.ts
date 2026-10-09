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

/** 打开外部链接。桌面端 WebView 会拦截普通导航，这里统一走新窗口。 */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
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

export { RELEASES_PAGE }
