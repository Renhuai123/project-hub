// 项目侦察:即使没里程碑,也给出"这个文件夹里有什么"的判断依据。
// 返回:最近修改、文件/目录数、总体积、文件类型分布、顶层文件树、README/HANDOFF 预览、git 信息。
// 有界遍历(限深 + 限量 + 跳依赖目录),避免大目录卡死。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const SKIP = new Set([
  '__pycache__', 'node_modules', '.git', '.idea', '.vscode', 'dist', 'build',
  '.next', 'venv', '.venv', 'target', '.cache', '.parcel-cache', '.turbo',
])

function root() {
  return join(os.homedir(), 'Downloads', '王多鱼')
}

function safeName(id) {
  const n = String(id).replace(/[\/\\:*?"<>|]/g, '').replace(/\.\./g, '').trim()
  if (!n || n.startsWith('.')) throw new Error('invalid project id')
  return n
}

// 有界遍历:文件数/目录数/总大小/类型分布/最新 mtime
function walk(dir, { maxDepth = 3, budget = 4000 } = {}) {
  let files = 0, dirs = 0, size = 0, newest = 0, count = 0
  const types = {}
  const stack = [[dir, 0]]
  while (stack.length) {
    const [d, depth] = stack.pop()
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (count >= budget) break
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue
      const full = join(d, e.name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      count++
      if (st.mtimeMs > newest) newest = st.mtimeMs
      if (e.isDirectory()) {
        dirs++
        if (depth < maxDepth) stack.push([full, depth + 1])
      } else {
        files++
        size += st.size
        const dot = e.name.lastIndexOf('.')
        const ext = dot > 0 ? e.name.slice(dot + 1).toLowerCase() : '(无扩展)'
        types[ext] = (types[ext] || 0) + 1
      }
    }
    if (count >= budget) break
  }
  return { files, dirs, size, newest, types, truncated: count >= budget }
}

// 顶层文件树:目录在前,再按最近修改排序
function topTree(dir, cap = 40) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const items = []
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const full = join(dir, e.name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    items.push({ name: e.name, dir: e.isDirectory(), size: e.isDirectory() ? 0 : st.size, mtime: st.mtimeMs })
  }
  items.sort((a, b) => Number(b.dir) - Number(a.dir) || b.mtime - a.mtime)
  return items.slice(0, cap)
}

// 里程碑数据"写于何时":来源文件的 mtime(.project.json / HANDOFF / README)
function metaMtime(dir) {
  for (const n of ['.project.json', 'HANDOFF.md', 'README.md', 'readme.md']) {
    const p = join(dir, n)
    if (existsSync(p)) {
      try {
        return statSync(p).mtimeMs
      } catch {
        /* next */
      }
    }
  }
  return 0
}

function readmePreview(dir) {
  for (const n of ['README.md', 'readme.md', 'Readme.md', 'HANDOFF.md', 'README.txt', 'readme.txt']) {
    const p = join(dir, n)
    if (existsSync(p)) {
      try {
        return { name: n, preview: readFileSync(p, 'utf8').slice(0, 1400) }
      } catch {
        /* next */
      }
    }
  }
  return null
}

function gitInfo(dir) {
  if (!existsSync(join(dir, '.git'))) return { repo: false }
  const run = (args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return ''
    }
  }
  const last = run(['log', '-1', '--format=%cI%x1f%s'])
  let lastCommit = null
  if (last) {
    const [iso, msg] = last.split('\x1f')
    lastCommit = { iso, msg: (msg || '').slice(0, 90) }
  }
  return { repo: true, branch: run(['rev-parse', '--abbrev-ref', 'HEAD']), lastCommit, dirty: run(['status', '--porcelain']) !== '' }
}

export function reconProject(id) {
  const name = safeName(id)
  const dir = join(root(), name)
  if (!existsSync(dir)) return { ok: false, error: 'not found: ' + name }
  const w = walk(dir)
  let mtime = w.newest
  if (!mtime) {
    try {
      mtime = statSync(dir).mtimeMs
    } catch {
      mtime = 0
    }
  }
  const types = Object.entries(w.types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, count]) => ({ ext, count }))
  return {
    ok: true,
    id: name,
    path: dir,
    mtime,
    metaMtime: metaMtime(dir),
    fileCount: w.files,
    dirCount: w.dirs,
    totalSize: w.size,
    truncated: w.truncated,
    types,
    tree: topTree(dir),
    readme: readmePreview(dir),
    git: gitInfo(dir),
  }
}

// 仪表盘用的廉价 mtime:仅顶层一层(不深扫),38 个项目也快
export function quickMtime(dir) {
  let newest = 0
  try {
    newest = statSync(dir).mtimeMs
  } catch {
    /* ignore */
  }
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue
      try {
        const st = statSync(join(dir, e.name))
        if (st.mtimeMs > newest) newest = st.mtimeMs
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return newest
}
