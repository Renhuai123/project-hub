import { useEffect, useMemo, useRef, useState } from 'react'
import { type Project, type Change, projectProgress, statusCounts } from '../data'
import { fmtAgo, greeting } from '../util'

type StatusFilter = 'all' | 'active' | 'done' | 'failed' | 'unknown'

const CAT_EMOJI: Record<string, string> = { 科研: '🧬', 引擎: '⚙️', 文化: '🀄', 其他: '📁' }
const CAT_COLOR: Record<string, string> = { 科研: 'var(--blue)', 引擎: 'var(--purple)', 文化: 'var(--orange)', 其他: 'var(--gray)' }
const CAT_ORDER = ['科研', '引擎', '文化', '其他']
const KIND_COLOR: Record<string, string> = { create: 'var(--green)', progress: 'var(--blue)', status: 'var(--orange)', delete: 'var(--red)' }

const RR = 84
const CIRC = 2 * Math.PI * RR

// 数字滚动:从上次显示值缓动到 target(easeOutCubic),进场即 0→目标,数据变即旧→新。
function useCountUp(target: number, ms = 950): number {
  const [val, setVal] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    const from = ref.current
    let raf = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (target - from) * e)
      ref.current = v
      setVal(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

// 控制台 hero:总进度脉搏(数字滚动 + 进度环画上来)+ 各类目弹性进度条 + AI 实时活动。数据全为真实聚合。
export function Hero({
  projects,
  changes,
  statusFilter,
  onStatus,
}: {
  projects: Project[]
  changes: Change[]
  statusFilter: StatusFilter
  onStatus: (k: StatusFilter) => void
}) {
  const agg = useMemo(() => {
    let done = 0
    let total = 0
    for (const p of projects) {
      const pr = projectProgress(p)
      done += pr.done
      total += pr.total
    }
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [projects])

  const c = statusCounts(projects)

  const catStats = useMemo(() => {
    const m = new Map<string, { count: number; done: number; total: number }>()
    for (const p of projects) {
      const pr = projectProgress(p)
      const e = m.get(p.category) ?? { count: 0, done: 0, total: 0 }
      e.count++
      e.done += pr.done
      e.total += pr.total
      m.set(p.category, e)
    }
    const order = CAT_ORDER.filter((x) => m.has(x)).concat([...m.keys()].filter((x) => !CAT_ORDER.includes(x)))
    return order.map((cat) => {
      const e = m.get(cat)!
      return { cat, count: e.count, known: e.total > 0, pct: e.total ? Math.round((e.done / e.total) * 100) : 0 }
    })
  }, [projects])

  // 进场:挂载下一帧再把条/环放到目标值,触发 CSS 过渡「长出来」
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(r)
  }, [])

  const aggShown = useCountUp(agg.pct) // 数字滚动 + 驱动主环,完美同步
  const dash = (CIRC * aggShown) / 100

  const tile = (k: StatusFilter, n: number, label: string, color?: string) => (
    <button className={`htile ${statusFilter === k ? 'on' : ''}`} onClick={() => onStatus(statusFilter === k ? 'all' : k)}>
      <b style={color ? { color } : undefined}>{n}</b>
      <small>{label}</small>
    </button>
  )

  return (
    <div className="hero">
      <div className="hero-hello">
        {greeting()},王多鱼
        <span>
          {projects.length} 个项目 · 总进度 <b>{agg.pct}%</b>
        </span>
      </div>

      <div className="hero-row">
        <div className="hcard hagg">
          <div className="hct">总进度</div>
          <div className="hring">
            <svg width="190" height="190">
              <circle cx="95" cy="95" r={RR} fill="none" stroke="var(--ringTrack)" strokeWidth="12" />
              <circle
                cx="95"
                cy="95"
                r={RR}
                fill="none"
                stroke="url(#heroGrad)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC}`}
                transform="rotate(-90 95 95)"
              />
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#37a0ff" />
                  <stop offset="1" stopColor="var(--blue)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="hring-c">
              <b>{aggShown}%</b>
              <span>
                {agg.done} / {agg.total} 里程碑
              </span>
            </div>
          </div>
          <div className="hnums">
            {tile('all', c.total, '总项目')}
            {tile('active', c.active, '进行中', 'var(--blue)')}
            {tile('done', c.done, '完成', 'var(--green)')}
            {tile('unknown', c.unknown, '待估算', 'var(--orange)')}
          </div>
        </div>

        <div className="hcard hcats">
          <div className="hct">按类目 · 进度</div>
          {catStats.map((s) => (
            <div className="hbar" key={s.cat}>
              <div className="hbar-h">
                <div className="hbar-nm">
                  {CAT_EMOJI[s.cat] ?? '📁'} {s.cat}
                  <em>{s.count} 项目</em>
                </div>
                <div className="hbar-pc" style={{ color: s.known ? CAT_COLOR[s.cat] ?? 'var(--gray)' : 'var(--muted)' }}>
                  {s.known ? `${s.pct}%` : '待估算'}
                </div>
              </div>
              <div className={`hbar-track${s.known ? '' : ' est'}`}>
                {s.known && (
                  <div
                    className="hbar-fill"
                    style={{ width: mounted ? `${s.pct}%` : '0%', background: CAT_COLOR[s.cat] ?? 'var(--gray)' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hcard hfeed">
          <div className="hct">AI 活动 · 实时</div>
          {changes.length === 0 ? (
            <div className="hfeed-empty">
              <div className="hfeed-pulse" />
              等待本地 AI 动作…
              <span>它建 / 改 / 删项目时,会实时滚出来。</span>
            </div>
          ) : (
            changes.slice(0, 5).map((ch, i) => (
              <div className="hit" key={ch.id + '-' + ch.t} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="hdot" style={{ background: KIND_COLOR[ch.kind] ?? 'var(--gray)' }} />
                <div className="hit-tx">
                  <b>{ch.text}</b>
                  <small>{fmtAgo(ch.t)}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
