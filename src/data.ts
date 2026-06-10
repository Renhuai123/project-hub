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
    id: 'project-hub',
    name: 'project-hub',
    category: '引擎',
    emoji: '⚙️',
    tagline: '项目进度中枢 · 覆盖桌面',
    status: 'active',
    goal: '把散落各处的项目,聚合成一张带进度的树/全景,一眼看清总进度。',
    outcome: '一个能覆盖桌面、AI 自动推导进度的项目中枢。',
    path: '~/Downloads/王多鱼/project-hub',
    branches: [
      { name: '设计 / 主题', milestones: [m('选定 Vercel 黑白电蓝', true), m('亮 / 暗双主题', true), m('进度环 + 状态语义色', true)] },
      { name: '前端', milestones: [m('脚手架 Vite+React', true), m('项目全景页', true), m('详情视图', true), m('新建项目', false)] },
      { name: '数据 / 扫描', milestones: [m('项目数据模型', true), m('扫真实文件夹', false), m('解析 HANDOFF/yaml', false)] },
      { name: '桌面壳', milestones: [m('Tauri 壁纸层', false)] },
    ],
  },
  {
    id: 'open-letter',
    name: '致大模型大厂公开信',
    category: '文化',
    emoji: '🀄',
    tagline: '小红书图文 · 深色轮播卡',
    status: 'done',
    goal: '给大模型大厂写一封小红书图文公开信,讲清通用工具的共识与反共识。',
    outcome: '已交付:8 张 1080×1440 深色轮播卡 + 全文 PDF。',
    path: '~/Downloads/王多鱼',
    branches: [
      { name: '内容', milestones: [m('全文初稿', true), m('8 张卡文案', true)] },
      { name: '设计', milestones: [m('深色卡 HTML 渲染', true), m('全文 PDF', true)] },
    ],
  },
  {
    id: 'vtumor',
    name: 'vtumor',
    category: '科研',
    emoji: '🧬',
    tagline: '虚拟荷瘤小鼠 · 细胞态扰动排序',
    status: 'active',
    goal: '在 vmouse 之上做细胞态扰动排序器,in silico 筛 myCAF→IGFBP4⁺ 态。',
    path: '~/Downloads/王多鱼/vtumor',
    branches: [
      { name: 'Tier A v1', milestones: [m('DE 加权连接性', true), m('跑通基线', true), m('避 set-overlap 坑', true)] },
      { name: '验证', milestones: [m('阳性对照', true), m('in-silico 筛选验证', false)] },
      { name: '闭环', milestones: [m('湿实验设计', false)] },
    ],
  },
  {
    id: 'astock-quant',
    name: 'A股量化选股引擎',
    category: '引擎',
    emoji: '⚙️',
    tagline: '东财直连 · 透明可回测',
    status: 'active',
    goal: '透明可回测的 A股 游资量化选股,东财直连、无 akshare,拒绝编造荐股。',
    path: '~/Downloads/王多鱼/astock-quant',
    branches: [
      { name: '数据', milestones: [m('东财直连', true), m('去 akshare 依赖', true)] },
      { name: '引擎', milestones: [m('选股因子', false), m('回测框架', false), m('实盘对接', false)] },
      { name: '校准', milestones: [m('拒绝编造荐股', true), m('胜率=回测 / 概率=校准', false), m('透明报告', false)] },
    ],
  },
  {
    id: 'vmouse',
    name: 'vmouse',
    category: '科研',
    emoji: '🧬',
    tagline: '虚拟小鼠 · 靶点·通路方向',
    status: 'active',
    goal: '药物/SMILES → 小鼠靶点·通路方向(↑/↓),真实 DB 驱动、零依赖。',
    path: '~/Downloads/王多鱼/vmouse',
    branches: [
      { name: 'MoA 层', milestones: [m('已知药 MoA 优先', true), m('ChEMBL parent 查', true)] },
      { name: '通路层', milestones: [m('通路方向 ↑/↓', true), m('真实 DB 接入', true)] },
      { name: 'AI 推理层', milestones: [m('推理引擎', false), m('未知药泛化', false), m('校验', false)] },
    ],
  },
  {
    id: 'wangduoyu-ai',
    name: '王多鱼AI 超级IP站',
    category: '引擎',
    emoji: '⚙️',
    tagline: '个人IP门户 · MiMo聊天 · 项目档案',
    status: 'active',
    goal: '个人 IP 门户:Next.js + MiMo 聊天 + 项目档案 + 内容引擎。',
    path: '~/Downloads/王多鱼',
    branches: [
      { name: '前端站', milestones: [m('门户页', true), m('项目档案', true), m('响应式', false)] },
      { name: 'MiMo 聊天', milestones: [m('接入 MiMo API', true), m('流式输出', false)] },
      { name: '内容引擎', milestones: [m('单一作者 SOP', true), m('日更 routine', true), m('周刊自动化', true), m('番茄签约', false)] },
    ],
  },
  {
    id: 'agora',
    name: '百家 Agora',
    category: '文化',
    emoji: '🀄',
    tagline: '名人智识分身 · 单聊 + 圆桌',
    status: 'active',
    goal: '跨领域逝者 agent 站,单聊 + 圆桌,与个人 IP 站解耦。',
    path: '~/agora',
    branches: [
      { name: '人格库', milestones: [m('全量第一手语料', true), m('人格结晶', false)] },
      { name: '前端', milestones: [m('单聊', true), m('圆桌', false)] },
      { name: '基建', milestones: [m('与 IP 站解耦', true), m('部署', false)] },
    ],
  },
  {
    id: 'sida-mingzhu',
    name: '四大名著打擂写小说',
    category: '文化',
    emoji: '🀄',
    tagline: '已被单作者 SOP 取代',
    status: 'failed',
    goal: '四大名著作者打擂写小说系统(多作者并行打擂)。',
    outcome: '已废弃:多作者打擂被单作者 SOP 取代,目录保留不调用。',
    branches: [
      { name: '多作者打擂', milestones: [m('打擂雏形', true), m('多作者并行', false), m('评分', false), m('收敛', false)] },
      { name: '迁移', milestones: [m('被单作者 SOP 取代', false)] },
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
