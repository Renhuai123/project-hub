# project-hub · 项目生命周期接口(给 AI agent)

这套接口是**给 AI(Claude Code / Codex / wanman agent)调用的**,用来管理 `~/Downloads/王多鱼` 下的项目。
**设计原则:人不手动建/删文件夹。人和 AI 聊,AI 经此接口创建 / 回写进度 / 删除项目。**

**入口(同一套契约,任选其一)**:
- **打包 .app(日常用这个)**:`http://127.0.0.1:3120` —— .app 内置 HTTP 推送端口,运行时常驻;agent `curl` 直推 → 桌面活动流**毫秒级反映**(Rust 发 `projects-changed` 事件,不等 6 秒轮询)。仅绑本机 127.0.0.1,不对外。`GET /health` 探活。
- **开发**(`npm run dev`):`http://localhost:5173` —— vite 中间层(同契约)。
- **没端口 / app 没开时**:直接在项目文件夹写 `.project.json`,桌面每 6 秒重扫自动捡到(最朴素、永远可用)。

下面示例的 Base 换成 `127.0.0.1:3120` 即对打包 .app 生效。

---

## 读:扫描全部项目

```
GET /api/projects  →  Project[]
```

## 建:产生新项目 / 新想法时,AI 调用

```
POST /api/project/create
{
  "name": "my-idea",            // 必填,会成为文件夹名(自动去非法字符)
  "category": "引擎",            // 科研 / 引擎 / 文化 / 其他
  "emoji": "⚙️",
  "goal": "一句话目标",
  "branches": [
    { "name": "前端", "milestones": [ { "title": "脚手架", "done": false } ] }
  ]
}
→ { ok:true, id, path }   // 建文件夹 + 写 .project.json
```

## 改:AI 干完活回写里程碑 / 状态

```
POST /api/project/update
{ "id": "my-idea", "patch": { "status": "done", "branches": [ ... ] } }
→ { ok:true, id }         // 浅合并进 .project.json(传 branches 则整体替换)
```

## 删:项目废弃时,AI 调用

```
POST /api/project/delete
{ "id": "my-idea" }                  // 软删(推荐):移到 .project-hub-trash,可恢复
{ "id": "my-idea", "hard": true }    // 硬删:不可恢复,慎用
→ { ok:true, id, deleted:"soft"|"hard" }
```

---

- 数据模型(Project / Branch / Milestone)见 `scanner/scan.mjs`。
- 软删目标 `.project-hub-trash/` 以 `.` 开头,扫描器自动忽略 → 删了立刻从仪表盘消失,但文件还在,可手动恢复。
- 进度只认里程碑:`% = 已完成里程碑 / 声明总数`;没有 branches 的项目在仪表盘显示「待估算」,不编假数。
