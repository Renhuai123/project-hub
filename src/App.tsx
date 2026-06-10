import { useEffect, useMemo, useRef, useState } from 'react'
import { PROJECTS, fetchProjects, projectProgress, isTauri, type Project, type Status, type Change } from './data'
import { listen } from '@tauri-apps/api/event'
import { TopBar } from './components/TopBar'
import { Hero } from './components/Hero'
import { ProjectCard } from './components/ProjectCard'
import { ProjectDetail } from './components/ProjectDetail'
import { AiPanel } from './components/AiPanel'
import { HelpPanel } from './components/HelpPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { getConfig } from './data'
import { notifyChanges } from './notify'

type Theme = 'light' | 'dark'
type StatusFilter = 'all' | Status | 'unknown'

const CAT_EMOJI: Record<string, string> = { 科研: '🧬', 引擎: '⚙️', 文化: '🀄', 其他: '📁' }
const CAT_ORDER = ['科研', '引擎', '文化', '其他']

function diffProjects(prev: Project[], next: Project[]): Omit<Change, 't'>[] {
  const a = new Map(prev.map((p) => [p.id, p]))
  const b = new Map(next.map((p) => [p.id, p]))
  const out: Omit<Change, 't'>[] = []
  for (const p of next) {
    const old = a.get(p.id)
    if (!old) {
      out.push({ id: p.id, kind: 'create', text: `新建项目 ${p.name}` })
      continue
    }
    const pa = projectProgress(old)
    const pb = projectProgress(p)
    if (pb.pct !== pa.pct || pb.done !== pa.done) out.push({ id: p.id, kind: 'progress', text: `${p.name} 进度 ${pa.pct}% → ${pb.pct}%` })
    else if (old.status !== p.status) out.push({ id: p.id, kind: 'status', text: `${p.name} 状态 → ${p.status}` })
  }
  for (const p of prev) if (!b.has(p.id)) out.push({ id: p.id, kind: 'delete', text: `删除 ${p.name}` })
  return out
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('hub-theme') as Theme) || 'light')
  const [selected, setSelected] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'default' | 'recent'>('default')
  const [aiOpen, setAiOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [userName, setUserName] = useState('')
  const [changes, setChanges] = useState<Change[]>([])
  const [lastSync, setLastSync] = useState<number>(0)
  const projectsRef = useRef<Project[]>([])
  projectsRef.current = projects ?? []

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hub-theme', theme)
  }, [theme])

  // 详情弹窗 / AI 面板打开时锁住背景首页滚动(避免弹窗在背景滑动的违和感)
  useEffect(() => {
    document.body.style.overflow = selected || aiOpen || helpOpen || settingsOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [selected, aiOpen, helpOpen, settingsOpen])

  // 实时同步:重扫项目,与上次对比 → 检测本地 AI 经接口做的变更,推进「AI 活动」流
  const syncProjects = async (showErr = false) => {
    try {
      const next = await fetchProjects()
      const prev = projectsRef.current
      if (prev.length) {
        const diffs = diffProjects(prev, next)
        if (diffs.length) {
          const now = Date.now()
          setChanges((c) => [...diffs.map((d) => ({ ...d, t: now })), ...c].slice(0, 40))
          // 被动驾驶舱:检测到 AI 经接口做的变更 → 弹原生系统通知(仅 .app)
          void notifyChanges(diffs)
        }
      }
      setProjects(next)
      setLastSync(Date.now())
      setErr(null)
    } catch (e) {
      if (showErr) setErr(String(e))
    }
  }

  // 首次加载:项目 + 配置(称呼);扫不到项目且未配置根目录 → 首跑引导(自动开设置)
  useEffect(() => {
    Promise.allSettled([fetchProjects(), getConfig()]).then(([pr, cr]) => {
      if (cr.status === 'fulfilled') setUserName(cr.value.userName ?? '')
      if (pr.status === 'fulfilled') {
        setProjects(pr.value)
        projectsRef.current = pr.value
        setLastSync(Date.now())
        if (pr.value.length === 0 && (cr.status !== 'fulfilled' || (cr.value.roots ?? []).length === 0)) {
          setFirstRun(true)
          setSettingsOpen(true)
        }
      } else {
        setErr(String(pr.reason))
        setProjects(PROJECTS)
      }
    })
  }, [])

  // 自动同步:fs-watch 推送为主(毫秒级),30 秒轮询仅兜底 + 窗口聚焦时刷新
  useEffect(() => {
    const id = window.setInterval(() => syncProjects(false), 30000)
    const onFocus = () => syncProjects(false)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 内置 HTTP 推送端口(:3120):外部 agent POST 改项目 → Rust 发 projects-changed 事件 → 立即重扫(不等 6s 轮询)
  useEffect(() => {
    if (!isTauri) return
    let un: (() => void) | undefined
    listen('projects-changed', () => syncProjects(false)).then((u) => {
      un = u
    })
    return () => un?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = projects ?? []
  // AI 刚动过(60s 内)的项目 → 卡片高亮脉冲
  const hotIds = new Set(changes.filter((ch) => Date.now() - ch.t < 60000).map((ch) => ch.id))

  const cats = useMemo(() => {
    const present = new Set(list.map((p) => p.category))
    return CAT_ORDER.filter((x) => present.has(x)).concat([...present].filter((x) => !CAT_ORDER.includes(x)))
  }, [list])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = list.filter((p) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'unknown') {
          if (projectProgress(p).known) return false
        } else if (p.status !== statusFilter) return false
      }
      if (categoryFilter && p.category !== categoryFilter) return false
      if (q && !`${p.name} ${p.tagline} ${p.category}`.toLowerCase().includes(q)) return false
      return true
    })
    if (sort === 'recent') out.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
    return out
  }, [list, statusFilter, categoryFilter, query, sort])

  const hasFilter = statusFilter !== 'all' || categoryFilter !== null || query.trim() !== ''

  const clearFilters = () => {
    setStatusFilter('all')
    setCategoryFilter(null)
    setQuery('')
  }

  // 全局 ESC:没开弹窗/面板时,有筛选(搜索 / 状态 / 类目)就清空,回到全部正常界面
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || selected || aiOpen || !hasFilter) return
      clearFilters()
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, aiOpen, hasFilter])

  // 网格方向键导航(卡片是 button,Enter/空格原生打开)
  const gridRef = useRef<HTMLDivElement>(null)
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const cards = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('.card') ?? [])
    if (!cards.length) return
    const cur = cards.indexOf(document.activeElement as HTMLElement)
    if (cur < 0) {
      cards[0].focus()
      e.preventDefault()
      return
    }
    const top0 = cards[0].offsetTop
    let cols = cards.findIndex((c) => c.offsetTop > top0)
    if (cols <= 0) cols = cards.length
    let next = cur
    if (e.key === 'ArrowRight') next = cur + 1
    else if (e.key === 'ArrowLeft') next = cur - 1
    else if (e.key === 'ArrowDown') next = cur + cols
    else if (e.key === 'ArrowUp') next = cur - cols
    if (next >= 0 && next < cards.length) {
      cards[next].focus()
      e.preventDefault()
    }
  }

  return (
    <div className="wrap">
      <TopBar query={query} onQuery={setQuery} userName={userName} onHelp={() => setHelpOpen(true)} onSettings={() => setSettingsOpen(true)} theme={theme} onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} onAiOpen={() => setAiOpen(true)} />

      {err && <div className="errbar">扫描接口出错,已回退示例数据 · {err}</div>}

      <Hero projects={list} changes={changes} statusFilter={statusFilter} onStatus={(k) => setStatusFilter(k)} />

      <div className="sech-row">
        <div className="sech-label mono">
          项目全景 · {filtered.length}
          {filtered.length < list.length ? ` / ${list.length}` : ''} 个
          {hasFilter && (
            <button className="link-btn" onClick={clearFilters}>
              清除筛选
            </button>
          )}
        </div>
        <div className="sech-tools">
          <div className="sort-seg mono">
            <button className={sort === 'default' ? 'on' : ''} onClick={() => setSort('default')} title="按状态分组">
              默认
            </button>
            <button className={sort === 'recent' ? 'on' : ''} onClick={() => setSort('recent')} title="按最近修改排序">
              最近活跃
            </button>
          </div>
          <div className="catbar">
            <button className={`catchip ${!categoryFilter ? 'on' : ''}`} onClick={() => setCategoryFilter(null)}>
              全部
            </button>
            {cats.map((cat) => (
              <button
                key={cat}
                className={`catchip ${categoryFilter === cat ? 'on' : ''}`}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              >
                {CAT_EMOJI[cat] ?? '📁'} {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {projects === null ? (
        <div className="grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="card skeleton" key={i} aria-hidden="true">
              <div className="sk-row">
                <span className="sk-bar w20" />
                <span className="sk-bar w16" />
              </div>
              <span className="sk-bar w60 tall" />
              <span className="sk-bar w40" />
              <div className="sk-rw">
                <span className="sk-ring" />
                <span className="sk-bar w50" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty mono">
          没有匹配的项目
          {hasFilter && (
            <>
              {' · '}
              <button className="link-btn" onClick={clearFilters}>
                清除筛选
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid" ref={gridRef} onKeyDown={onGridKey}>
          {filtered.map((p) => (
            <ProjectCard key={p.id} p={p} onClick={() => setSelected(p)} hot={hotIds.has(p.id)} />
          ))}
        </div>
      )}

      <ProjectDetail
        key={selected?.id ?? 'none'}
        project={selected}
        onClose={() => setSelected(null)}
        onChanged={() => syncProjects(false)}
      />

      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        projects={list}
        changes={changes}
        lastSync={lastSync}
        onChanged={() => syncProjects(false)}
        onOpenProject={(p) => {
          setAiOpen(false)
          setSelected(p)
        }}
      />

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsPanel
        open={settingsOpen}
        firstRun={firstRun}
        onClose={() => {
          setSettingsOpen(false)
          setFirstRun(false)
        }}
        onSaved={() => {
          setFirstRun(false)
          getConfig().then((c) => setUserName(c.userName ?? '')).catch(() => {})
          syncProjects(false)
        }}
      />

    </div>
  )
}
