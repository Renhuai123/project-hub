import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore - 纯 ESM 扫描器,无类型声明
import { scanProjects, defaultRoots } from './scanner/scan.mjs'
// @ts-ignore - 纯 ESM 管理接口
import { createProject, updateProject, deleteProject } from './scanner/manage.mjs'
// @ts-ignore - 纯 ESM 拟草稿(web 安全 LLM / 启发式)
import { draftProject } from './scanner/draft.mjs'
// @ts-ignore - 纯 ESM 项目侦察
import { reconProject } from './scanner/recon.mjs'

function readJson(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c: any) => (body += c))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

// 开发期接口:GET 扫描(给前端) + POST 增/改/删(给 AI agent)。Tauri 阶段平移到 Rust。
function projectApi() {
  return {
    name: 'project-api',
    configureServer(server: any) {
      const send = (res: any, code: number, obj: any) => {
        res.statusCode = code
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(obj))
      }

      server.middlewares.use('/api/projects', (_req: any, res: any) => {
        try {
          send(res, 200, scanProjects(defaultRoots()))
        } catch (e) {
          send(res, 500, { error: String(e) })
        }
      })

      // —— 以下接口供 AI agent 调用(人不手动操作)——
      server.middlewares.use('/api/project/create', async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        try {
          send(res, 200, createProject(await readJson(req)))
        } catch (e) {
          send(res, 400, { error: String(e) })
        }
      })

      server.middlewares.use('/api/project/update', async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        try {
          const b = await readJson(req)
          send(res, 200, updateProject(b.id, b.patch || {}))
        } catch (e) {
          send(res, 400, { error: String(e) })
        }
      })

      server.middlewares.use('/api/project/delete', async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        try {
          const b = await readJson(req)
          send(res, 200, deleteProject(b.id, { hard: !!b.hard }))
        } catch (e) {
          send(res, 400, { error: String(e) })
        }
      })

      server.middlewares.use('/api/project/draft', async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        try {
          const b = await readJson(req)
          send(res, 200, await draftProject(b.id))
        } catch (e) {
          send(res, 400, { error: String(e) })
        }
      })

      server.middlewares.use('/api/project/recon', async (req: any, res: any) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        try {
          const b = await readJson(req)
          send(res, 200, reconProject(b.id))
        } catch (e) {
          send(res, 400, { error: String(e) })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), projectApi()],
  server: { host: true, port: 5173 },
})
