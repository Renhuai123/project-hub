import { useEffect, useRef, useState } from 'react'
import { type Project, type Change, createProject, updateProject, deleteProjectApi } from '../data'
import { interpret, type AiAction } from '../ai'
import { fmtAgo } from '../util'

interface Msg {
  role: 'user' | 'ai'
  text: string
  action?: AiAction
  confirm?: boolean
}

const KIND_ICON: Record<Change['kind'], string> = {
  create: '🟢',
  progress: '📈',
  status: '🔁',
  delete: '🗑',
}

// 「AI 自管」面板 —— AI 视角:本地 AI 经接口自己增删改项目,桌面实时同步、活动流滚动。
// 人退到观察位;手动命令是可选兜底,不是主入口。
export function AiPanel({
  open,
  onClose,
  projects,
  changes,
  lastSync,
  onChanged,
  onOpenProject,
}: {
  open: boolean
  onClose: () => void
  projects: Project[]
  changes: Change[]
  lastSync: number
  onChanged: () => Promise<void> | void
  onOpenProject: (p: Project) => void
}) {
  const [manual, setManual] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 重新渲染让「上次同步 N 秒前」走动
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setTick((t) => t + 1), 5000)
    return () => window.clearInterval(id)
  }, [open])

  useEffect(() => {
    if (open && manual) window.setTimeout(() => inputRef.current?.focus(), 90)
  }, [open, manual])

  useEffect(() => {
    if (manual) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, manual])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pushAi = (text: string) => setMsgs((x) => [...x, { role: 'ai', text }])

  const runAction = async (action: AiAction) => {
    setBusy(true)
    try {
      if (action.type === 'open') {
        const p = projects.find((x) => x.id === action.id)
        if (p) {
          onOpenProject(p)
          pushAi(`已打开「${p.name}」。`)
        } else pushAi('没找到那个项目。')
      } else if (action.type === 'create') {
        const r = await createProject(action.input || {})
        if (r?.error) pushAi('建失败:' + r.error)
        else {
          await onChanged()
          pushAi(`✓ 已新建「${(action.input as { name?: string })?.name ?? ''}」。`)
        }
      } else if (action.type === 'update') {
        const r = await updateProject(action.id!, action.patch || {})
        if (r?.error) pushAi('改失败:' + r.error)
        else {
          await onChanged()
          pushAi(`✓ 已更新「${action.id}」。`)
        }
      } else if (action.type === 'delete') {
        const r = await deleteProjectApi(action.id!, action.hard)
        if (r?.error) pushAi('删失败:' + r.error)
        else {
          await onChanged()
          pushAi(`✓ 已${action.hard ? '彻底' : '软'}删除「${action.id}」${action.hard ? '' : ',回收站可恢复'}。`)
        }
      }
    } catch (e) {
      pushAi('出错:' + String(e))
    }
    setBusy(false)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMsgs((x) => [...x, { role: 'user', text }])
    const r = interpret(text, projects)
    if (r.action && r.confirm) {
      setMsgs((x) => [...x, { role: 'ai', text: r.reply, action: r.action, confirm: true }])
    } else if (r.action) {
      pushAi(r.reply)
      await runAction(r.action)
    } else {
      pushAi(r.reply)
    }
  }

  const resolve = async (idx: number, ok: boolean) => {
    const m = msgs[idx]
    setMsgs((x) => x.map((mm, i) => (i === idx ? { ...mm, confirm: false } : mm)))
    if (ok && m.action) await runAction(m.action)
    else pushAi('好的,取消了。')
  }

  const ROOT = '~/Downloads/王多鱼'

  return (
    <>
      <div className={`ai-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`ai-panel${open ? ' open' : ''}`} role="dialog" aria-label="AI 自管">
        <div className="ai-head">
          <div className="ai-title">✦ AI 自管 · 接口与同步</div>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        <div className="ai-sync">
          <span className="ai-dot" />
          实时同步中 · 每 6s + 窗口聚焦
          <span className="ai-sync-t">{lastSync ? `上次 ${fmtAgo(lastSync)}` : '等待首次同步'}</span>
        </div>

        <div className="ai-section">
          <div className="ai-sec-h mono">AI 活动 · 本地 AI 经接口改动后实时滚出</div>
          {changes.length === 0 ? (
            <div className="ai-feed-empty">
              等待本地 AI 动作…
              <br />
              它新建 / 改进度 / 删除项目时,会自动出现在这里,卡片也同步更新。
            </div>
          ) : (
            <ul className="ai-feed">
              {changes.map((c, i) => (
                <li key={i} className="ai-fitem">
                  <span className="ai-fic">{KIND_ICON[c.kind]}</span>
                  <span className="ai-ftext">{c.text}</span>
                  <span className="ai-ftime mono">{fmtAgo(c.t)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ai-section">
          <div className="ai-sec-h mono">接口 · 交给本地 AI 自己调</div>
          <div className="ai-iface mono">
            <div>· 直接写项目的 <b>.project.json</b>(扫描器读,桌面自动同步)</div>
            <div>· 或 dev 走 HTTP:<b>POST /api/project/create|update|delete</b></div>
            <div className="ai-iface-dim">根目录 {ROOT} · 软删进 .project-hub-trash</div>
          </div>
        </div>

        <div className="ai-manual">
          <button className="ai-manual-toggle" onClick={() => setManual((v) => !v)}>
            {manual ? '▾' : '▸'} 手动命令(可选 —— 平时是 AI 自己经接口管)
          </button>
          {manual && (
            <>
              <div className="ai-body" ref={bodyRef}>
                {msgs.length === 0 && <div className="ai-feed-empty">直接说:新建项目 X · 删除 X · 把 X 标记完成 · 重新评估 X 进度。</div>}
                {msgs.map((m, i) => (
                  <div key={i} className={`ai-msg ${m.role}`}>
                    <div className="ai-bubble">{m.text}</div>
                    {m.confirm && m.action && (
                      <div className="ai-confirm">
                        <button className="btn sm" onClick={() => resolve(i, true)} disabled={busy}>
                          执行
                        </button>
                        <button className="catchip" onClick={() => resolve(i, false)} disabled={busy}>
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="ai-input">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  placeholder="手动命令一句…"
                  rows={2}
                  spellCheck={false}
                />
                <button className="btn" onClick={send} disabled={busy || !input.trim()}>
                  发送
                </button>
              </div>
            </>
          )}
        </div>

        <div className="ai-foot mono">人退到观察位 · AI 经接口自管、桌面实时同步 · 自然语言 LLM 需配 HUB_AI_KEY</div>
      </aside>
    </>
  )
}
