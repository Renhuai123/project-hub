import { useState } from 'react'

// 使用说明(右上角 ?):快速上手 / AI 接入三式 / FAQ。
// 复用 ai-panel 抽屉样式;接入模板全部一键复制 —— 这是"可交付产品"的说明书本体。
const MCP_PATH = '~/Downloads/王多鱼/project-hub/scanner/mcp-server.mjs'

const TPL_PROJECT_JSON = `{
  "name": "我的项目",
  "category": "引擎",
  "emoji": "⚙️",
  "tagline": "一句话简介",
  "status": "active",
  "goal": "一句话目标",
  "branches": [
    {
      "name": "主线",
      "milestones": [
        { "title": "第一个里程碑", "done": true },
        { "title": "第二个里程碑", "done": false }
      ]
    }
  ]
}`

const TPL_AI_PROMPT = `## 项目看板回写约定(project hub)

桌面看板监视我配置的项目根目录,文件变更 1 秒内自动上屏。
你在任一项目文件夹里干活时,顺手维护其根目录的 \`.project.json\`:

- 字段: name(中文显示名)/category/emoji/tagline/status(active|done|failed)/goal/branches
- 进度只认里程碑: % = done 数 / 总数;没把握的写 done:false;没拆里程碑就别写 branches
- 零编造: 只回写真实完成的事
- 也可走运行时接口(毫秒级): POST http://127.0.0.1:3120/api/project/update {"id":"文件夹名","patch":{...}}`

const TPL_CURL = `# 列出全部项目
curl -s http://127.0.0.1:3120/api/projects

# 更新进度(把某条里程碑标记完成后整体覆写 branches)
curl -s -X POST http://127.0.0.1:3120/api/project/update \\
  -H 'Content-Type: application/json' \\
  -d '{"id":"my-project","patch":{"status":"active","tagline":"新简介"}}'

# 新建项目
curl -s -X POST http://127.0.0.1:3120/api/project/create \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"new-project","category":"引擎","goal":"目标"}'`

const TPL_MCP = `{
  "mcpServers": {
    "project-hub": {
      "command": "node",
      "args": ["${MCP_PATH.replace('~', '$HOME')}"]
    }
  }
}`

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="hp-block">
      <div className="hp-block-head">
        <span className="mono">{label}</span>
        <button
          className="hp-copy"
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setOk(true)
              setTimeout(() => setOk(false), 1500)
            })
          }}
        >
          {ok ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <pre className="hp-pre mono">{text}</pre>
    </div>
  )
}

export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'start' | 'ai' | 'faq'>('start')
  return (
    <>
      <div className={`ai-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`ai-panel${open ? ' open' : ''}`} role="dialog" aria-label="使用说明">
        <div className="ai-head">
          <div className="ai-title">📖 使用说明</div>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        <div className="hp-tabs">
          {(
            [
              ['start', '快速上手'],
              ['ai', '接入你的 AI'],
              ['faq', '常见问题'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={`hp-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="hp-body">
          {tab === 'start' && (
            <>
              <div className="hp-h">三步开始</div>
              <ol className="hp-ol">
                <li>
                  点右上角 <b>⚙ 设置</b>,把你的「项目根目录」加进来(根目录下的每个文件夹 = 一张项目卡片)
                </li>
                <li>
                  在任一项目文件夹放一个 <code>.project.json</code>(模板见下),卡片立刻有名字、简介和进度环
                </li>
                <li>里程碑 done 数 / 总数 = 进度。改文件即生效,1 秒内上屏,无需手动刷新</li>
              </ol>
              <CopyBlock label=".project.json 模板" text={TPL_PROJECT_JSON} />
              <div className="hp-h">没有 .project.json 会怎样?</div>
              <p className="hp-p">
                文件夹仍会显示为「待估算」卡片;点开卡片可让 AI 侦察文件夹内容并拟一份草稿,一键写入。
              </p>
            </>
          )}

          {tab === 'ai' && (
            <>
              <p className="hp-p">
                任何能<b>写文件</b>或<b>发 HTTP</b> 的 AI(Claude Code / Cursor / Codex / 本地模型 +
                任意 agent 框架)都能接入,三选一:
              </p>
              <div className="hp-h">方式一 · 文件协议(零依赖,推荐)</div>
              <p className="hp-p">
                把下面这段贴进你 AI 的记忆文件(CLAUDE.md / .cursorrules / 系统提示词),它干完活就会自己回写进度:
              </p>
              <CopyBlock label="贴给 AI 的回写约定" text={TPL_AI_PROMPT} />
              <div className="hp-h">方式二 · HTTP 接口(毫秒级上屏)</div>
              <CopyBlock label="curl 示例(本机 127.0.0.1:3120)" text={TPL_CURL} />
              <div className="hp-h">方式三 · MCP(Claude Code / Cline 等 MCP 客户端)</div>
              <p className="hp-p">
                本应用自带零依赖 MCP 服务器脚本,把下面配置加进 MCP 客户端(如 Claude Code 的{' '}
                <code>.mcp.json</code>),AI 即获得 list/create/update/delete 项目四个工具:
              </p>
              <CopyBlock label="MCP 配置" text={TPL_MCP} />
            </>
          )}

          {tab === 'faq' && (
            <>
              <div className="hp-h">进度不动?</div>
              <p className="hp-p">
                检查 .project.json 是否合法 JSON(不能带注释);看板 30 秒兜底轮询 + 文件监听双保险,改完
                1 秒内应上屏。
              </p>
              <div className="hp-h">如何把窗口变成桌面壁纸层?</div>
              <p className="hp-p">
                按 <code>⌘⇧P</code> 切换壁纸模式:窗口沉到桌面图标之下,常驻不挡操作。再按一次恢复普通窗口。
              </p>
              <div className="hp-h">数据存在哪?会上传吗?</div>
              <p className="hp-p">
                全部本地:项目数据就是你文件夹里的 .project.json;应用配置在 ~/.project-hub/config.json。HTTP
                端口只绑 127.0.0.1,不对外网开放,无任何云端上传。
              </p>
              <div className="hp-h">删除项目去哪了?</div>
              <p className="hp-p">默认软删:移入根目录下 .project-hub-trash/,可随时手动恢复。</p>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
