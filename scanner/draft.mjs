// AI 拟里程碑草稿 —— 读项目真实文件,用 web 安全 LLM 拟草稿;无 key 时启发式兜底。
// 红线:绝不使用 tp- key(web 调用有封号风险)。走 HUB_AI_KEY(DeepSeek / Kimi / sk- 等 web 安全 key)。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// 载入 project-hub/.env(HUB_AI_KEY 等;别用 tp-),不覆盖已有环境变量
try {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url))
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
} catch {
  /* 无 .env 就算了 */
}

function root() {
  return join(os.homedir(), 'Downloads', '王多鱼')
}
function safeName(name) {
  const n = String(name || '').replace(/[\/\\:*?"<>|]/g, '').replace(/\.\./g, '').trim()
  if (!n || n.startsWith('.')) throw new Error('invalid name')
  return n
}

function gatherContext(dir, name) {
  let ctx = `项目文件夹名:${name}\n`
  for (const f of ['README.md', 'HANDOFF.md']) {
    const p = join(dir, f)
    if (existsSync(p)) {
      try {
        ctx += `\n## ${f}\n${readFileSync(p, 'utf8').slice(0, 1500)}\n`
      } catch {
        /* ignore */
      }
    }
  }
  try {
    const items = readdirSync(dir).filter((n) => !n.startsWith('.')).slice(0, 40)
    ctx += `\n## 文件清单\n${items.join(', ')}\n`
  } catch {
    /* ignore */
  }
  return ctx.slice(0, 4000)
}

function cleanLine(s) {
  return String(s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[(.+?)\]\((?:.+?)\)/g, '$1')
    .replace(/^[\s>#*+\-]+/, '')
    .trim()
    .slice(0, 72)
}

function readDoc(dir) {
  for (const n of ['README.md', 'readme.md', 'Readme.md', 'HANDOFF.md', 'README.txt', 'readme.txt']) {
    const p = join(dir, n)
    if (existsSync(p)) {
      try {
        return { name: n, text: readFileSync(p, 'utf8') }
      } catch {
        /* next */
      }
    }
  }
  return null
}

// 第一个标题 / 非空段落当目标
function goalFromText(text) {
  let fence = false
  for (const ln of text.split(/\r?\n/)) {
    if (/^\s*```/.test(ln)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const t = ln.trim()
    if (!t) continue
    const c = cleanLine(t)
    if (c.length >= 4) return c
  }
  return ''
}

// 正文里的 checkbox / 「下一步·待办」bullet → 里程碑
function milestonesFromText(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (const ln of lines) {
    const cb = ln.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/)
    if (cb) out.push({ title: cleanLine(cb[2]), done: cb[1].toLowerCase() === 'x' })
  }
  if (out.length) return out.filter((m) => m.title).slice(0, 12)
  // 没 checkbox:抓「下一步 / 待办 / TODO / Next Steps」段下的 bullet 当未完成
  let inNext = false
  for (const ln of lines) {
    const h = ln.match(/^#{1,6}\s+(.+)$/) || ln.match(/^\*\*(.+?)\*\*\s*:?\s*$/)
    if (h) {
      inNext = /下一步|待办|todo|next\s*step|计划/i.test(h[1])
      continue
    }
    if (inNext) {
      const b = ln.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
      if (b) out.push({ title: cleanLine(b[1]), done: false })
    }
  }
  return out.filter((m) => m.title).slice(0, 12)
}

// 文件名 → 可读标题:去扩展名、去前导序号、下划线转空格
function cleanFileName(n) {
  return n
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[_\-.\s]*/, '')
    .replace(/[_\-]+/g, ' ')
    .trim()
    .slice(0, 48)
}

function heuristicDraft(dir, name) {
  let items = []
  try {
    items = readdirSync(dir).filter((n) => !n.startsWith('.'))
  } catch {
    /* ignore */
  }

  // 1) README/HANDOFF 正文:目标 + 正文里的 checkbox/待办
  const doc = readDoc(dir)
  let goal = ''
  const branches = []
  if (doc) {
    goal = goalFromText(doc.text)
    const ms = milestonesFromText(doc.text)
    if (ms.length) branches.push({ name: `里程碑(自 ${doc.name})`, milestones: ms })
  }

  // 2) 截图/图片密集的文件夹 → 每张命名图当一项"已产出"(对验收/渲染类项目尤其有用)
  const imgs = items.filter((n) => /\.(png|jpe?g|gif|webp|pdf|svg)$/i.test(n))
  if (!branches.length && imgs.length >= 3 && imgs.length >= items.length * 0.5) {
    const ms = imgs
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .slice(0, 12)
      .map((n) => ({ title: cleanFileName(n) + ' 已产出', done: true }))
    branches.push({ name: '产出物(自文件名)', milestones: ms })
    if (!goal) goal = `${name}:已产出 ${imgs.length} 项可视化交付`
  }

  // 3) 代码项目类型信号(文件名)
  if (!branches.length) {
    const lc = items.map((n) => n.toLowerCase())
    const has = (re) => lc.some((n) => re.test(n))
    const ms = []
    if (has(/readme/)) ms.push({ title: '写 README / 文档', done: true })
    if (has(/package\.json|requirements|cargo\.toml|environment\.ya?ml|go\.mod|pyproject/)) ms.push({ title: '脚手架 / 依赖', done: true })
    if (lc.includes('src') || has(/^app\.|^index\.|^main\./)) ms.push({ title: '核心实现', done: false })
    if (has(/test|spec/)) ms.push({ title: '测试', done: false })
    if (has(/dist|build|out|renders|deliverable|交付|报告|manuscript/)) ms.push({ title: '产出 / 交付', done: false })
    if (ms.length) branches.push({ name: '里程碑(启发式)', milestones: ms })
  }

  if (!branches.length) {
    branches.push({ name: '里程碑(启发式)', milestones: [{ title: '明确目标', done: false }, { title: '拆里程碑', done: false }] })
  }
  return { goal: goal || `整理 ${name} 的目标与进度(草稿)`, branches, engine: 'heuristic' }
}

async function llmDraft(ctx) {
  const key = process.env.HUB_AI_KEY
  if (!key) return null
  const base = (process.env.HUB_AI_BASE || 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const model = process.env.HUB_AI_MODEL || 'deepseek-chat'
  const sys =
    '你是项目管理助手。根据项目资料拟里程碑草稿。只输出 JSON 不要任何解释,格式:' +
    '{"goal":"一句话目标","branches":[{"name":"分支","milestones":[{"title":"里程碑","done":true或false}]}]}。' +
    'done 依据资料判断是否已完成,拿不准填 false。2-4 个分支,每分支 2-5 个里程碑。'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: ctx }], temperature: 0.3, max_tokens: 1200 }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = await res.json()
  const txt = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim()
  const m = txt.match(/\{[\s\S]*\}/)
  const obj = JSON.parse(m ? m[0] : txt)
  obj.engine = model
  return obj
}

export async function draftProject(id) {
  const name = safeName(id)
  const dir = join(root(), name)
  if (!existsSync(dir)) throw new Error('not found: ' + name)
  const ctx = gatherContext(dir, name)
  let draft = null
  let note = ''
  try {
    draft = await llmDraft(ctx)
  } catch (e) {
    note = 'LLM 调用失败,已用启发式兜底:' + String(e).slice(0, 120)
  }
  if (!draft) {
    draft = heuristicDraft(dir, name)
    if (!note) note = process.env.HUB_AI_KEY ? '' : '未配置 HUB_AI_KEY(web 安全 key),当前用启发式草稿;配置后可得更好的 AI 草稿'
  }
  return { ok: true, id: name, draft, note }
}
