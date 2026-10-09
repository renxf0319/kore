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

const REPO_API = 'https://api.github.com/repos/renxf0319/kore/releases/latest'
const RELEASES_PAGE = `${__REPO_URL__}/releases/latest`

/** 超时：网络不通时不能无限转圈，8 秒足够完成一次正常请求 */
const TIMEOUT_MS = 8000

export interface UpdateInfo {
  current: string
  latest: string
  hasUpdate: boolean
  /** 仓库尚未发布任何 Release —— 不是错误，只是无可比对的新版本 */
  noRelease?: boolean
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
    const res = await fetch(REPO_API, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub 接口限流，请稍后再试')
    }
    // 404 不是错误：仓库还没有发布任何 Release。
    // GitHub 对「无 release」与「仓库不存在」返回同一个码，但既然应用本身
    // 就是从这个仓库构建的，后一种不可能发生 —— 所以按「暂无可比对版本」处理。
    if (res.status === 404) {
      return { current: __APP_VERSION__, latest: __APP_VERSION__, hasUpdate: false, noRelease: true }
    }
    if (!res.ok) throw new Error(`GitHub 接口返回 ${res.status}`)
    const data = (await res.json()) as { tag_name?: string }
    const latest = (data.tag_name ?? '').replace(/^v/i, '')
    if (!latest) throw new Error('未拿到版本号')
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
