import { type Project, projectProgress, nextMilestones } from '../data'
import { ProgressRing } from './ProgressRing'
import { StatusChip, RING_COLOR } from './StatusChip'
import { fmtAgo, isStale } from '../util'

export function ProjectCard({ p, onClick, hot }: { p: Project; onClick: () => void; hot?: boolean }) {
  const prog = projectProgress(p)
  const next = nextMilestones(p, 2)
  const stale = isStale(p.mtime, 30)
  return (
    <button
      className={`card${hot ? ' hot' : ''}`}
      onClick={onClick}
      onMouseMove={(e) => {
        // 跟手光泽:把指针位置写入 CSS 变量,::after 高光随之移动
        const r = e.currentTarget.getBoundingClientRect()
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
    >
      <div className="ctop">
        <span className="tag mono">
          {p.emoji} {p.category}
        </span>
        <StatusChip status={p.status} />
      </div>
      <h3>{p.name}</h3>
      <div className="sub">{p.tagline}</div>
      <div className="rw">
        <ProgressRing pct={prog.pct} color={RING_COLOR[p.status]} indeterminate={!prog.known} />
        <div className="mile">
          {prog.known ? (
            <>
              已完成{' '}
              <b>
                {prog.done} / {prog.total}
              </b>{' '}
              里程碑
              {p.status === 'done' ? (
                <>
                  <br />
                  已交付
                </>
              ) : next.length ? (
                <>
                  <br />
                  差:{next.join('、')}
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="muted2">未估算里程碑</span>
              <br />
              点开 → AI 拟草稿
            </>
          )}
        </div>
      </div>
      {p.mtime ? (
        <div className={`cfoot mono${stale ? ' stale' : ''}`}>
          <span className="ago">⟳ {fmtAgo(p.mtime)}</span>
          {stale && <span className="zzz" title="超 30 天未改动">💤 沉睡</span>}
        </div>
      ) : null}
    </button>
  )
}
