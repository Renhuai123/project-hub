// 项目扫描器:把真实文件夹读成 Project[]。
// 优先级:.project.json(显式) > HANDOFF.md(派生里程碑) > README.md(仅简介,进度待估算) > 仅文件夹名。
// 红线:没有里程碑数据的项目,进度返回空 branches(前端显示「待估算」),绝不编造 %。
// 状态只从「文件夹名」判定(废弃/搁置→failed),绝不从正文瞎猜;done/failed 想准确就写 .project.json。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { quickMtime } from './recon.mjs'

const SKIP_EXACT = new Set(['__pycache__', 'node_modules', '.git', '.idea', '.vscode', 'dist', 'build', 'data', 'xiaojing-report', 'archives'])
const SKIP_SUFFIX = ['_runs', '-data', '_data', '_test', '_cache', '.egg-info', '_screenshots']

function isProjectDir(name) {
  if (name.startsWith('.')) return false
  if (SKIP_EXACT.has(name)) return false
  if (SKIP_SUFFIX.some((s) => name.endsWith(s))) return false
  return true
}

const CATS = [
  { re: /(tumor|mouse|brca|microbe|fusarium|antibody|metabric|bft|vsv|proteogenom|阴茎|凯格尔|paper|aim1|养生|节气)/i, category: '科研', emoji: '🧬' },
  { re: /(名著|文豪|agora|哥伦布|狼人|吸血鬼|紫薇|ziwei|小说|王多鱼ai传|传)/i, category: '文化', emoji: '🀄' },
  { re: /(quant|hub|site|tool|offer|jarvis|audit|reply|聚鲸|软文|logo|promo|tesla|article|家办|opc|report|sphere)/i, category: '引擎', emoji: '⚙️' },
]
function classify(name) {
  for (const c of CATS) if (c.re.test(name)) return { category: c.category, emoji: c.emoji }
  return { category: '其他', emoji: '📁' }
}

function clean(s) {
  return String(s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[(.+?)\]\((?:.+?)\)/g, '$1')
    .replace(/^[\s>#-]+/, '')
    .replace(/[（(]\s*$/, '')
    .trim()
    .slice(0, 72)
}

// 标题→区块:锚定开头,避免「## 二期…(已完成)」这种带关键词的普通标题被误判
function sectionKey(hRaw) {
  const norm = hRaw.replace(/^#{1,6}\s*/, '').replace(/^\d+[.、)]\s*/, '').trim()
  const s = norm.toLowerCase()
  if (/^goal\b/.test(s) || norm.startsWith('目标')) return 'goal'
  if (/^next\s*step/.test(s) || /^todo\b/.test(s) || norm.startsWith('下一步') || norm.startsWith('后续') || norm.startsWith('待办')) return 'next'
  if (/^current\s*progress/.test(s) || norm.startsWith('当前进度') || norm.startsWith('已完成') || norm.startsWith('进度')) return 'progress'
  if (/^what\s*worked/.test(s) || norm.startsWith('有效')) return 'worked'
  if (/^what\s*didn/.test(s) || norm.startsWith('无效') || norm.startsWith('避免')) return 'didnt'
  return null
}

const isBullet = (ln) => ln.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
const MAX_MS = 14

function parseHandoff(text) {
  const lines = text.split(/\r?\n/)
  const checks = []
  const sec = { goal: [], next: [], progress: [], worked: [], didnt: [] }
  let cur = null
  let fence = false
  for (const ln of lines) {
    if (/^\s*```/.test(ln)) { fence = !fence; continue }
    if (fence) continue
    const h = ln.match(/^#{1,6}\s+(.+?)\s*#*$/) || ln.match(/^\*\*(.+?)\*\*\s*:?\s*$/)
    if (h) { cur = sectionKey(h[1]); continue }
    const cb = ln.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/)
    if (cb) { checks.push({ done: cb[1].toLowerCase() === 'x', title: clean(cb[2]) }); continue }
    if (!cur) continue
    const b = isBullet(ln)
    if (b) sec[cur].push(clean(b[1]))
    else if (cur === 'goal' && ln.trim() && !sec.goal.length) sec.goal.push(clean(ln))
  }
  const goal = sec.goal[0] || ''
  let milestones
  if (checks.length) {
    milestones = checks
  } else {
    // 只用「当前进度」(done) 与「下一步」(todo) 当里程碑;What Worked/Didn't 是笔记,不计入
    milestones = [
      ...sec.progress.map((t) => ({ title: t, done: true })),
      ...sec.next.map((t) => ({ title: t, done: false })),
    ]
  }
  milestones = milestones.filter((m) => m.title).slice(0, MAX_MS)
  return { goal, milestones }
}

function readFirstHeading(text) {
  for (const ln of text.split(/\r?\n/)) {
    const h = ln.match(/^#{1,3}\s+(.+)$/)
    if (h) return clean(h[1])
    if (ln.trim()) return clean(ln)
  }
  return ''
}

function statusFromName(name) {
  if (/废弃|搁置|deprecated|abandon|已停|弃用/i.test(name)) return 'failed'
  return 'active'
}

function buildProject(dir, name) {
  const path = dir
  const cls = classify(name)
  const base = {
    id: name,
    name,
    category: cls.category,
    emoji: cls.emoji,
    tagline: '',
    status: statusFromName(name),
    goal: '',
    path,
    branches: [],
    source: 'folder',
    mtime: quickMtime(dir),
  }

  // 1) .project.json — 显式,完全覆盖
  const metaPath = join(dir, '.project.json')
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
      return { ...base, ...meta, id: name, path, source: 'project.json' }
    } catch {
      /* fall through */
    }
  }

  // 2) HANDOFF.md — 派生里程碑(抓得到才用,抓不到落到 README)
  const handoffPath = join(dir, 'HANDOFF.md')
  if (existsSync(handoffPath)) {
    try {
      const { goal, milestones } = parseHandoff(readFileSync(handoffPath, 'utf8'))
      if (goal || milestones.length) {
        return {
          ...base,
          goal,
          tagline: goal ? goal.slice(0, 32) : 'HANDOFF 项目',
          branches: milestones.length ? [{ name: '里程碑(自 HANDOFF)', milestones }] : [],
          source: 'handoff',
        }
      }
    } catch {
      /* fall through */
    }
  }

  // 3) README.md — 仅简介,进度待估算
  for (const rn of ['README.md', 'readme.md', 'Readme.md']) {
    const rp = join(dir, rn)
    if (existsSync(rp)) {
      try {
        const tag = readFirstHeading(readFileSync(rp, 'utf8')).slice(0, 36)
        return { ...base, tagline: tag, goal: tag, source: 'readme' }
      } catch {
        /* fall through */
      }
    }
  }

  // 4) 裸文件夹
  return { ...base, tagline: '待补充简介' }
}

export function scanProjects(roots) {
  const out = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    let names
    try {
      names = readdirSync(root)
    } catch {
      continue
    }
    for (const name of names) {
      const dir = join(root, name)
      let st
      try {
        st = statSync(dir)
      } catch {
        continue
      }
      if (!st.isDirectory() || !isProjectDir(name)) continue
      try {
        out.push(buildProject(dir, name))
      } catch {
        /* skip broken */
      }
    }
  }
  const rank = { active: 0, done: 1, failed: 2 }
  out.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, 'zh'))
  return out
}

export function defaultRoots() {
  return [join(os.homedir(), 'Downloads', '王多鱼'), join(os.homedir(), 'Downloads', '紫薇斗数网页')]
}

// CLI: node scan.mjs [--json]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ps = scanProjects(defaultRoots())
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(ps, null, 2))
  } else {
    console.log(`扫描到 ${ps.length} 个项目\n`)
    for (const p of ps) {
      const t = p.branches.reduce((a, b) => a + b.milestones.length, 0)
      const d = p.branches.reduce((a, b) => a + b.milestones.filter((m) => m.done).length, 0)
      const pct = t ? `${Math.round((d / t) * 100)}%`.padStart(4) : '   -'
      console.log(`[${p.status.padEnd(6)}] ${pct}  ${p.emoji} ${p.name.padEnd(30)} · ${p.tagline.slice(0, 24)}  (${p.source})`)
    }
  }
}
