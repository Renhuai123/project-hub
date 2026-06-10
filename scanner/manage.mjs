// 项目生命周期管理 —— 供 AI agent 调用,人不手动建/删文件夹。
// create(产生新项目)/ update(回写进度)/ delete(软删到 .project-hub-trash;hard 才不可恢复)。
import { mkdirSync, writeFileSync, existsSync, renameSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

function root() {
  return join(os.homedir(), 'Downloads', '王多鱼')
}

// 防路径穿越:去掉斜杠/盘符/.. ;禁空、禁隐藏目录
function safeName(name) {
  const n = String(name || '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .trim()
  if (!n || n.startsWith('.')) throw new Error('invalid project name')
  return n
}

export function createProject(input = {}) {
  const name = safeName(input.name)
  const dir = join(root(), name)
  if (existsSync(dir)) throw new Error('already exists: ' + name)
  mkdirSync(dir, { recursive: true })
  const meta = {
    category: input.category || '其他',
    emoji: input.emoji || '📁',
    tagline: input.tagline || '',
    status: input.status || 'active',
    goal: input.goal || '',
    ...(input.outcome ? { outcome: input.outcome } : {}),
    branches: Array.isArray(input.branches) ? input.branches : [],
  }
  writeFileSync(join(dir, '.project.json'), JSON.stringify(meta, null, 2), 'utf8')
  return { ok: true, id: name, path: dir }
}

export function updateProject(id, patch = {}) {
  const name = safeName(id)
  const dir = join(root(), name)
  if (!existsSync(dir)) throw new Error('not found: ' + name)
  const metaPath = join(dir, '.project.json')
  let meta = {}
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    } catch {
      /* 坏 json 当空 */
    }
  }
  const next = { ...meta, ...patch } // 浅合并;传 branches 则整体替换
  writeFileSync(metaPath, JSON.stringify(next, null, 2), 'utf8')
  return { ok: true, id: name }
}

export function deleteProject(id, opts = {}) {
  const name = safeName(id)
  const dir = join(root(), name)
  if (!existsSync(dir)) throw new Error('not found: ' + name)
  if (opts.hard) {
    rmSync(dir, { recursive: true, force: true }) // 不可恢复,慎用
    return { ok: true, id: name, deleted: 'hard' }
  }
  // 默认软删:移到 .project-hub-trash(以 . 开头 → 扫描器自动忽略,可手动恢复)
  const trash = join(root(), '.project-hub-trash')
  mkdirSync(trash, { recursive: true })
  const dest = join(trash, name + '__' + Date.now())
  renameSync(dir, dest)
  return { ok: true, id: name, deleted: 'soft', trash: dest }
}
