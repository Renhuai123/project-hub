// 原生 macOS 通知 —— 被动驾驶舱:本地 AI 经接口改了项目,桌面检测到就弹系统通知,
// 你不用盯着看板。仅在 Tauri(.app)里生效;浏览器调试无通知。权限首次用到时再请求。
import { isTauri } from './data'

type Changeish = { text: string }

let permPromise: Promise<boolean> | null = null

async function ensurePermission(): Promise<boolean> {
  if (!isTauri) return false
  if (!permPromise) {
    permPromise = (async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        return granted
      } catch {
        return false
      }
    })()
  }
  return permPromise
}

// 一批变更 → 1 条具体通知,或多条时一条汇总通知(避免刷屏)。
export async function notifyChanges(changes: Changeish[]): Promise<void> {
  if (!isTauri || changes.length === 0) return
  if (!(await ensurePermission())) return
  try {
    const { sendNotification } = await import('@tauri-apps/plugin-notification')
    const title = '项目中枢 · AI 动态'
    if (changes.length === 1) {
      sendNotification({ title, body: changes[0].text })
    } else {
      const head = changes.slice(0, 3).map((c) => c.text).join(' · ')
      sendNotification({ title, body: `AI 更新了 ${changes.length} 处:${head}${changes.length > 3 ? ' …' : ''}` })
    }
  } catch {
    /* 通知失败不影响主流程 */
  }
}
