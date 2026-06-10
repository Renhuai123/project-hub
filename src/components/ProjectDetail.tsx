import { useEffect, useRef, useState } from 'react'
import { type Project, type Recon, projectProgress, draftProject, updateProject, reconProject } from '../data'
import { ProjectGraph } from './ProjectGraph'
import { ProgressRing } from './ProgressRing'
import { StatusChip, RING_COLOR } from './StatusChip'
import { ReconView } from './ReconView'
import { fmtAgo, fmtSize } from '../util'

interface Draft {
  goal?: string
  branches?: { name: string; milestones: { title: string; done: boolean }[] }[]
  engine?: string
}

const SRC_LABEL: Record<string, string> = {
  'project.json': '.project.json',
  handoff: 'HANDOFF.md',
  readme: 'README',
  folder: '文件夹',
}

export function ProjectDetail({
  project,
  onClose,
  onChanged,
}: {
  project: Project | null
  onClose: () => void
  onChanged?: () => void
}) {
  const [sel, setSel] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [note, setNote] = useState('')
  const [closing, setClosing] = useState(false)
  const [recon, setRecon] = useState<Recon | null>(null)
  const closingRef = useRef(false)

  // 有里程碑的项目:拉一次侦察数据给底部 strip 显元信息(空状态由 ReconView 自己拉)
  useEffect(() => {
    if (!project || project.branches.length === 0) {
      setRecon(null)
      return
    }
    let alive = true
    reconProject(project.id)
      .then((r) => {
        if (alive && r && r.ok) setRecon(r)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // 关闭:先播退场动画(0.2s),再真正卸载(onClose 把 selected 置空 → 组件卸载)
  const requestClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, 210)
  }

  // Esc 关闭(等效点 ✕ / 点遮罩)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!project) return null
  const prog = projectProgress(project)
  const branch = sel != null ? project.branches[sel] : null
  // 方法视图自动判定:有分支带 by(agent / skill)来源 = 部署过多 agent → 默认展开;否则不显示。无需手动点。
  const methodView = project.branches.some((b) => !!(b.by && (b.by.agent || b.by.skills?.length)))
  // 进度可能过时:项目内容在里程碑数据(.project.json 等)之后还改过(>1 天)
  const reconStale = !!(recon && recon.metaMtime > 0 && recon.mtime > recon.metaMtime + 86400000)

  const runDraft = async () => {
    setDrafting(true)
    setDraft(null)
    setNote('')
    try {
      const j = await draftProject(project.id)
      if (j.error) setNote('出错:' + j.error)
      else {
        setDraft(j.draft)
        setNote(j.note || '')
      }
    } catch (e) {
      setNote('请求失败:' + String(e))
    }
    setDrafting(false)
  }

  const saveDraft = async () => {
    if (!draft) return
    await updateProject(project.id, { goal: draft.goal, branches: draft.branches })
    onChanged?.()
    requestClose()
  }

  return (
    <div className={`detail-overlay${closing ? ' closing' : ''}`} onClick={requestClose}>
      <div className={`detail-modal${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div className="dh-left">
            <span className="dh-emoji">{project.emoji}</span>
            <div>
              <h2>{project.name}</h2>
              {project.path && <div className="dh-path mono">{project.path}</div>}
            </div>
          </div>
          <div className="dh-right">
            <StatusChip status={project.status} />
            <ProgressRing pct={prog.pct} color={RING_COLOR[project.status]} size={46} indeterminate={!prog.known} />
            <button className="icon-btn" onClick={requestClose} title="关闭 (Esc)">
              ✕
            </button>
          </div>
        </div>

        {draft ? (
          <div className="detail-empty">
            <div className="draft-preview">
              <div className="strip-title mono">
                {draft.engine ? `AI 草稿 · ${draft.engine}` : 'AI 草稿'} · 重新评估自当前文件(确认后写入 .project.json)
              </div>
              <div className="goal-box">{draft.goal}</div>
              {draft.branches?.map((b, i) => (
                <div className="branch" key={i}>
                  <div className="brow">
                    <span className="bname">{b.name}</span>
                  </div>
                  <ul className="ms">
                    {b.milestones?.map((m, j) => (
                      <li key={j} className={m.done ? 'on' : ''}>
                        <span className="ms-mark">{m.done ? '✓' : '○'}</span>
                        {m.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {note && <div className="draft-note">{note}</div>}
              <div className="draft-actions">
                <button className="btn" onClick={saveDraft}>
                  ✓ 确认保存{project.branches.length ? '(覆盖现有里程碑)' : ''}
                </button>
                <button className="catchip" onClick={runDraft} disabled={drafting}>
                  {drafting ? '重拟中…' : '重拟'}
                </button>
                <button className="catchip" onClick={() => setDraft(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : project.branches.length ? (
          <>
            <div className="detail-graph">
              <ProjectGraph project={project} onSelectBranch={setSel} methodView={methodView} />
            </div>
            <div className="detail-strip">
              {branch ? (
                <>
                  <div className="strip-title mono">{branch.name} · 里程碑</div>
                  <ul className="ms ms-row">
                    {branch.milestones.map((m, i) => (
                      <li key={i} className={m.done ? 'on' : ''}>
                        <span className="ms-mark">{m.done ? '✓' : '○'}</span>
                        {m.title}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="strip-meta">
                  <div className="sm-cols mono">
                    <span>
                      <i>最近</i> {fmtAgo(recon?.mtime ?? project.mtime)}
                    </span>
                    {recon && (
                      <span>
                        <i>文件</i> {recon.fileCount} · {fmtSize(recon.totalSize)}
                        {recon.truncated ? '+' : ''}
                      </span>
                    )}
                    <span>
                      <i>来源</i> {SRC_LABEL[project.source ?? 'folder'] ?? project.source}
                    </span>
                    <span>
                      <i>分支</i> {project.branches.length} · {prog.total} 里程碑
                    </span>
                    {recon?.git?.repo && (
                      <span className="sm-git">
                        ⎇ {recon.git.branch || 'git'}
                        {recon.git.dirty ? ' · 有改动' : ''}
                      </span>
                    )}
                  </div>
                  {recon?.git?.repo && recon.git.lastCommit ? (
                    <div className="sm-commit mono">最近提交:{recon.git.lastCommit.msg}</div>
                  ) : null}
                  <div className="sm-actions">
                    <button
                      className={`catchip${reconStale ? ' warn' : ''}`}
                      onClick={runDraft}
                      disabled={drafting}
                      title="用当前文件重新评估进度,生成里程碑提案(确认后才写入)"
                    >
                      {drafting ? '🔄 重新评估中…' : '🔄 重新评估进度'}
                    </button>
                    {reconStale ? (
                      <span className="stale-hint">内容在里程碑之后还动过 · 进度可能已过时</span>
                    ) : (
                      <span className="strip-hint mono">悬停分支节点 → 看里程碑明细</span>
                    )}
                  </div>
                  {note && <div className="draft-note">{note}</div>}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="detail-empty">
            <div className="rfn-k mono">开头 · 目标</div>
            <p>{project.goal || project.tagline}</p>
            <ReconView id={project.id} />
            <div className="empty-note">暂无里程碑(来源:{project.source ?? '文件夹'})。AI 读它的真实文件后,可拟一份里程碑草稿。</div>
            <button className="btn" onClick={runDraft} disabled={drafting}>
              {drafting ? '🪄 AI 拟草稿中…' : '🪄 AI 拟里程碑草稿'}
            </button>
            {note && <div className="draft-note">{note}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
