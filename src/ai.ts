// 内嵌 AI 命令理解器:自然语言 → 项目管理动作(经已有 create/update/delete 接口落地)。
// 纯前端、关键词驱动,dev 与 .app 都能用、不需要任何 key。危险动作(删除/覆盖)交给面板确认。
// 红线:不自动执行删除;一切落地都走用户确认 + 已审过的接口。
import { type Project } from './data'

export interface AiAction {
  type: 'create' | 'update' | 'delete' | 'open'
  id?: string
  input?: Record<string, unknown>
  patch?: Record<string, unknown>
  hard?: boolean
  label: string
}

export interface AiReply {
  reply: string
  action?: AiAction
  confirm?: boolean // 需用户点「执行」才落地
}

// 在用户的话里认出已存在的项目(最长名优先,避免子串误命中)
function findProject(text: string, projects: Project[]): Project | null {
  const hit = projects
    .filter((p) => text.includes(p.name) || (p.id && text.includes(p.id)))
    .sort((a, b) => b.name.length - a.name.length)
  return hit[0] || null
}

function stripName(s: string): string {
  return s
    .replace(/[「」『』""''《》]/g, '')
    .replace(/^\s*[:：]\s*/, '')
    .replace(/\s*(这个)?项目\s*$/, '')
    .trim()
}

export function interpret(message: string, projects: Project[]): AiReply {
  const t = message.trim()
  if (!t) return { reply: '说点什么吧 —— 比如「新建项目 X」「删除 X」「把 X 标记完成」。' }
  const lc = t.toLowerCase()

  // 帮助
  if (/^(help|帮助|怎么用|你能干|你能做|能做什么|你会)/.test(lc) || /有哪些(命令|功能|能力)/.test(t)) {
    return {
      reply:
        '我能经接口帮你管项目(你确认后才落地):\n' +
        '· 新建项目 <名字>\n' +
        '· 删除 <项目>(默认进回收站,可恢复)\n' +
        '· 把 <项目> 标记完成 / 进行中 / 搁置\n' +
        '· 重新评估 <项目> 的进度\n' +
        '· 打开 / 列出项目\n' +
        '直接用大白话说就行。',
    }
  }

  // 列出 / 概览
  if (/(列出|有哪些项目|多少个项目|项目列表|概览|总览)/.test(t)) {
    const active = projects.filter((p) => p.status === 'active').length
    const recent = [...projects].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0)).slice(0, 5).map((p) => p.name)
    return { reply: `共 ${projects.length} 个项目(${active} 进行中)。最近活跃:${recent.join('、')}。` }
  }

  // 删除
  if (/(删除|删掉|移除|删了|去掉|干掉)/.test(t)) {
    const p = findProject(t, projects)
    if (!p) return { reply: '要删哪个?我没在你的话里认出项目名(用全名试试)。' }
    const hard = /彻底|永久|硬删|不留/.test(t)
    return {
      reply: `确认${hard ? '彻底' : '软'}删除「${p.name}」?${hard ? '不可恢复。' : '会移到 .project-hub-trash,可恢复。'}`,
      action: { type: 'delete', id: p.id, hard, label: `${hard ? '彻底' : '软'}删除 ${p.name}` },
      confirm: true,
    }
  }

  // 新建
  if (/(新建|创建|新增|建一个|加一个|建个|起一个|开一个)/.test(t)) {
    const name = stripName(t.replace(/^.*?(新建|创建|新增|建一个|加一个|建个|起一个|开一个|建)\s*(项目|文件夹)?\s*/, ''))
    if (!name) return { reply: '新建的项目叫什么名字?' }
    const exists = projects.some((p) => p.name === name || p.id === name)
    if (exists) return { reply: `「${name}」已经存在了。` }
    return {
      reply: `新建项目「${name}」?会在 ~/Downloads/王多鱼 下建文件夹 + .project.json。`,
      action: { type: 'create', input: { name }, label: `新建项目 ${name}` },
      confirm: true,
    }
  }

  // 标记状态
  const statusRules: { re: RegExp; status: string; label: string }[] = [
    { re: /(标记)?\s*(完成|搞定|做完|交付|完结|done)/i, status: 'done', label: '完成' },
    { re: /(标记)?\s*(进行中|在做|重新开始|继续做|active)/i, status: 'active', label: '进行中' },
    { re: /(标记)?\s*(失败|搁置|废弃|放弃|停了|暂停|弃用|failed)/i, status: 'failed', label: '失败 / 搁置' },
  ]
  for (const r of statusRules) {
    if (r.re.test(t)) {
      const p = findProject(t, projects)
      if (!p) return { reply: `要把哪个项目标记为「${r.label}」?` }
      if (p.status === r.status) return { reply: `「${p.name}」已经是「${r.label}」了。` }
      return {
        reply: `把「${p.name}」标记为「${r.label}」?`,
        action: { type: 'update', id: p.id, patch: { status: r.status }, label: `${p.name} → ${r.label}` },
        confirm: true,
      }
    }
  }

  // 重新评估进度
  if (/(重新评估|重新评测|刷新进度|重新拟|重新派生|评估进度|更新进度)/.test(t)) {
    const p = findProject(t, projects)
    if (!p) return { reply: '重新评估哪个项目的进度?' }
    return { reply: `打开「${p.name}」,点详情里的 🔄 重新评估进度即可(读当前文件拟提案,你确认)。`, action: { type: 'open', id: p.id, label: `打开 ${p.name}` } }
  }

  // 打开 / 查看
  if (/(打开|查看|看看|看一下|详情|点开)/.test(t)) {
    const p = findProject(t, projects)
    if (p) return { reply: `打开「${p.name}」。`, action: { type: 'open', id: p.id, label: `打开 ${p.name}` } }
    return { reply: '要打开哪个项目?' }
  }

  // 兜底:若认出了项目名,默认打开
  const p = findProject(t, projects)
  if (p) return { reply: `没认出具体指令,先帮你打开「${p.name}」。`, action: { type: 'open', id: p.id, label: `打开 ${p.name}` } }

  return { reply: '没太懂。试试:「新建项目 X」「删除 X」「把 X 标记完成」「重新评估 X 的进度」,或问「帮助」。' }
}
