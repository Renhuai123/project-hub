import { type Project, projectProgress, branchProgress } from '../data'
import { ProgressRing } from './ProgressRing'
import { StatusChip, RING_COLOR } from './StatusChip'

export function DetailDrawer({ project, onClose }: { project: Project | null; onClose: () => void }) {
  if (!project) return null
  const prog = projectProgress(project)
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="dh-title">
            <span className="dh-emoji">{project.emoji}</span>
            <div>
              <h2>{project.name}</h2>
              {project.path && <div className="dh-path mono">{project.path}</div>}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="drawer-summary">
          <ProgressRing pct={prog.pct} color={RING_COLOR[project.status]} size={72} indeterminate={!prog.known} />
          <div>
            <StatusChip status={project.status} />
            <div className="dh-count mono">
              {prog.known ? `${prog.done} / ${prog.total} 里程碑` : '待估算'}
              {project.source ? ` · ${project.source}` : ''}
            </div>
          </div>
        </div>

        <div className="section-label mono">开头 · 目标</div>
        <div className="goal-box">{project.goal || '— 待补充 —'}</div>

        <div className="section-label mono">分支 · 进度</div>
        {project.branches.length ? (
          <div className="branches">
            {project.branches.map((b) => {
              const bp = branchProgress(b)
              return (
                <div className="branch" key={b.name}>
                  <div className="brow">
                    <span className="bname">{b.name}</span>
                    <span className="bpct mono">{bp.pct}%</span>
                  </div>
                  <div className="bbar">
                    <i style={{ width: `${bp.pct}%` }} />
                  </div>
                  <ul className="ms">
                    {b.milestones.map((mil, i) => (
                      <li key={i} className={mil.done ? 'on' : ''}>
                        <span className="ms-mark">{mil.done ? '✓' : '○'}</span>
                        {mil.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="outcome-box">
            暂无里程碑(来源:{project.source ?? '文件夹'})。即将支持「AI 扫描 → 拟里程碑草稿」,你确认后生成进度。
          </div>
        )}

        <div className="section-label mono">结尾 · 成果</div>
        <div className="outcome-box">{project.outcome ?? '— 未达成,待补足上面的分支项 —'}</div>
      </aside>
    </div>
  )
}
