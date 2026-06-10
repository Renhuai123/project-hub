// 项目数据模型 —— 里程碑驱动:进度% = 已完成里程碑 / 声明总数
// 现为 mock(用真实项目填充),后续由文件扫描层替换。
import { invoke } from '@tauri-apps/api/core'

// 在 Tauri(打包 .app / tauri dev)里走 Rust 命令;在浏览器(vite 5188)里走 HTTP 中间件。
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export type Status = 'active' | 'done' | 'failed'

export interface Milestone {
  title: string
  done: boolean
}
export interface Provenance {
  agent?: string // 哪个 agent 干的(主 Claude / subagent 名)
  skills?: string[] // 调用了哪些 skill
}
export interface Branch {
  name: string
  milestones: Milestone[]
  by?: Provenance // 方法/分工:这条分支由谁 + 哪些 skill 产出(AI 干活时打标)
}
export interface Project {
  id: string
  name: string
  category: string
  emoji: string
  tagline: string
  status: Status
  goal: string // 开头
  outcome?: string // 结尾 / 成果
  path?: string
  source?: string // 数据来源:project.json / handoff / readme / folder
  branches: Branch[]
  mtime?: number // 最近修改(ms epoch)— 活跃度排序 / 沉睡标记
}

// 项目侦察:没里程碑也能看清"这文件夹里有什么"
export interface Recon {
  ok: boolean
  error?: string
  id: string
  path: string
  mtime: number
  metaMtime: number
  fileCount: number
  dirCount: number
  totalSize: number
  truncated: boolean
  types: { ext: string; count: number }[]
  tree: { name: string; dir: boolean; size: number; mtime: number }[]
  readme: { name: string; preview: string } | null
  git: { repo: boolean; branch?: string; lastCommit?: { iso: string; msg: string } | null; dirty?: boolean }
}

// AI 经接口改动项目后,桌面同步时检测出的变更(「AI 活动」流)
export interface Change {
  id: string
  kind: 'create' | 'progress' | 'status' | 'delete'
  text: string
  t: number
}

const m = (title: string, done = false): Milestone => ({ title, done })

export const PROJECTS: Project[] = [
  {
    id: 'demo-engine',
    name: '示例 · 数据管线引擎',
    category: '引擎',
    emoji: '⚙️',
    tagline: '这是离线兜底示例 · 配置项目根目录后显示你的真实项目',
    status: 'active',
    goal: '演示卡片:里程碑驱动进度,% = 已完成 / 总数。',
    branches: [
      { name: '数据层', milestones: [m('接入数据源', true), m('清洗规则', true), m('增量同步', false)] },
      { name: '服务层', milestones: [m('API 设计', true), m('部署上线', false)] },
    ],
  },
  {
    id: 'demo-research',
    name: '示例 · 研究课题',
    category: '科研',
    emoji: '🧬',
    tagline: '把论文/实验拆成里程碑,AI 每推进一步就回写一格',
    status: 'active',
    goal: '演示卡片:AI 改 .project.json,看板 1 秒内更新。',
    branches: [
      { name: '实验', milestones: [m('基线复现', true), m('消融实验', false), m('结果分析', false)] },
    ],
  },
  {
    id: 'demo-writing',
    name: '示例 · 长篇写作',
    category: '文化',
    emoji: '🀄',
    tagline: '已完成项目的样子:绿环 + 已交付',
    status: 'done',
    goal: '演示卡片:status=done 的完成态。',
    outcome: '已交付:终稿 12 万字。',
    branches: [
      { name: '成稿', milestones: [m('大纲', true), m('初稿', true), m('终稿', true)] },
    ],
  },
]

export function projectProgress(p: Project) {
  let done = 0,
    total = 0
  for (const b of p.branches)
    for (const x of b.milestones) {
      total++
      if (x.done) done++
    }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, known: total > 0 }
}

export function branchProgress(b: Branch) {
  const total = b.milestones.length
  const done = b.milestones.filter((x) => x.done).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function nextMilestones(p: Project, n = 2): string[] {
  const undone: string[] = []
  for (const b of p.branches) for (const x of b.milestones) if (!x.done) undone.push(x.title)
  return undone.slice(0, n)
}

export function statusCounts(ps: Project[]) {
  return {
    total: ps.length,
    active: ps.filter((p) => p.status === 'active').length,
    done: ps.filter((p) => p.status === 'done').length,
    failed: ps.filter((p) => p.status === 'failed').length,
    unknown: ps.filter((p) => !projectProgress(p).known).length,
  }
}

async function http(path: string, body?: unknown): Promise<any> {
  const res = await fetch(
    path,
    body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined,
  )
  return res.json()
}

// 从后端拉真实项目;失败时调用方回退到上面的 PROJECTS(示例)。
export async function fetchProjects(): Promise<Project[]> {
  if (isTauri) return (await invoke('scan_projects')) as Project[]
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('scan ' + res.status)
  return (await res.json()) as Project[]
}

export async function createProject(input: Record<string, unknown>): Promise<any> {
  return isTauri ? await invoke('create_project', { input }) : http('/api/project/create', input)
}
export async function updateProject(id: string, patch: Record<string, unknown>): Promise<any> {
  return isTauri ? await invoke('update_project', { id, patch }) : http('/api/project/update', { id, patch })
}
export async function deleteProjectApi(id: string, hard = false): Promise<any> {
  return isTauri ? await invoke('delete_project', { id, hard }) : http('/api/project/delete', { id, hard })
}
export async function draftProject(id: string): Promise<any> {
  return isTauri ? await invoke('draft_project', { id }) : http('/api/project/draft', { id })
}
export interface HubConfig {
  roots: string[]
  userName: string
}
export async function getConfig(): Promise<HubConfig> {
  return (isTauri ? await invoke('get_config') : await http('/api/config')) as HubConfig
}
export async function setConfig(cfg: HubConfig): Promise<HubConfig> {
  if (isTauri) return (await invoke('set_config', { cfg })) as HubConfig
  const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
  const d = await res.json()
  if (!res.ok || d?.ok === false) throw new Error(d?.error || 'save failed')
  return d as HubConfig
}

export async function reconProject(id: string): Promise<Recon> {
  return (isTauri ? await invoke('recon_project', { id }) : await http('/api/project/recon', { id })) as Recon
}
