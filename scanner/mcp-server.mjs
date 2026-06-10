#!/usr/bin/env node
// project-hub MCP 服务器(零依赖,stdio JSON-RPC 2.0)
// 让任何 MCP 客户端(Claude Code / Cline / Cursor 等)直接获得看板读写工具。
// 桥接正在运行的 project-hub.app 内置端口(127.0.0.1:3120);app 未启动时返回明确指引。
//
// 客户端配置示例(.mcp.json):
// { "mcpServers": { "project-hub": { "command": "node", "args": ["<本文件绝对路径>"] } } }
import { createInterface } from 'node:readline'

const BASE = 'http://127.0.0.1:3120'
const NOT_RUNNING = 'project-hub.app 未在运行。请先启动应用(它常驻桌面壁纸层),再重试。'

const TOOLS = [
  {
    name: 'list_projects',
    description: '列出看板上全部项目(含分支/里程碑/进度/状态)。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_project',
    description: '在看板新建项目(会在项目根目录创建文件夹和 .project.json)。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '项目名(也是文件夹名)' },
        category: { type: 'string', description: '科研|引擎|文化|其他' },
        emoji: { type: 'string' },
        tagline: { type: 'string', description: '一句话简介' },
        status: { type: 'string', description: 'active|done|failed' },
        goal: { type: 'string', description: '一句话目标' },
        branches: { type: 'array', description: '分支与里程碑,结构: [{name, milestones:[{title,done}]}]' },
      },
      required: ['name'],
      additionalProperties: true,
    },
  },
  {
    name: 'update_project',
    description: '更新项目(patch 局部覆盖 .project.json 字段;里程碑进度只回写真实完成的事,零编造)。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '项目 id(=文件夹名)' },
        patch: { type: 'object', description: '要覆盖的字段,如 {status, tagline, branches}' },
      },
      required: ['id', 'patch'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_project',
    description: '删除项目(默认软删:移入根目录 .project-hub-trash/,可恢复)。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        hard: { type: 'boolean', description: 'true=硬删除(不可恢复),默认 false' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

async function callHub(method, path, body) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(NOT_RUNNING)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

async function runTool(name, args) {
  switch (name) {
    case 'list_projects':
      return await callHub('GET', '/api/projects')
    case 'create_project':
      return await callHub('POST', '/api/project/create', args)
    case 'update_project':
      return await callHub('POST', '/api/project/update', args)
    case 'delete_project':
      return await callHub('POST', '/api/project/delete', args)
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function replyErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

const rl = createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  line = line.trim()
  if (!line) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = msg
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'project-hub', version: '1.0.0' },
      })
    } else if (method === 'notifications/initialized') {
      // notification,无需回复
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS })
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params
      try {
        const out = await runTool(name, args || {})
        reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] })
      } catch (e) {
        reply(id, { content: [{ type: 'text', text: `错误: ${e.message}` }], isError: true })
      }
    } else if (id !== undefined) {
      replyErr(id, -32601, `method not found: ${method}`)
    }
  } catch (e) {
    if (id !== undefined) replyErr(id, -32603, String(e?.message || e))
  }
})
