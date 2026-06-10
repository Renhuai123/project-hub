// 体积 / 时间 / 活跃度 小工具(侦察视图 + 时间维度共用)

export function fmtSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

const DAY = 86400000

export function fmtAgo(ms?: number): string {
  if (!ms) return '—'
  const d = Date.now() - ms
  if (d < 60000) return '刚刚'
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前'
  if (d < DAY) return Math.floor(d / 3600000) + ' 小时前'
  if (d < 30 * DAY) return Math.floor(d / DAY) + ' 天前'
  if (d < 365 * DAY) return Math.floor(d / (30 * DAY)) + ' 个月前'
  return Math.floor(d / (365 * DAY)) + ' 年前'
}

export function staleDays(ms?: number): number {
  if (!ms) return Infinity
  return Math.floor((Date.now() - ms) / DAY)
}

// 久未动 = 沉睡(默认 30 天)
export function isStale(ms?: number, days = 30): boolean {
  return staleDays(ms) >= days
}

// 按当前钟点的问候语(hero 大标题 + 顶栏吸顶小标题共用)
export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
