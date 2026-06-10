import { useEffect, useRef, useState } from 'react'
import { greeting } from '../util'

// 顶栏:iOS 风吸顶导航。滚动后毛玻璃吸顶 + 大标题(在 Hero 里)收起、这里浮现紧凑问候。
export function TopBar({
  query,
  onQuery,
  userName,
  onHelp,
  onSettings,
  theme,
  onToggleTheme,
  onAiOpen,
}: {
  query: string
  onQuery: (s: string) => void
  userName?: string
  onHelp: () => void
  onSettings: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onAiOpen: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ⌘K / Ctrl+K 聚焦搜索
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className={`bar${scrolled ? ' scrolled' : ''}`}>
      <div
        className="brand"
        style={{ cursor: 'pointer' }}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="回到顶部"
      >
        <div className="glyph" />
        <b>项目中枢</b>
        <span className="mono">project hub</span>
      </div>
      <div className="bar-title">{greeting()}{userName ? `,${userName}` : ''}</div>
      <div className="actions">
        <div className="search">
          <span className="search-k mono">⌘K</span>
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              else if (e.key === 'Escape') onQuery('')
            }}
            placeholder="搜索项目…"
            spellCheck={false}
          />
          {query && (
            <button className="search-x" onClick={() => onQuery('')} title="清除">
              ✕
            </button>
          )}
        </div>
        <button className="icon-btn bar-icon bar-ai" onClick={onAiOpen} title="AI 自管:本地 AI 经接口增删改项目,实时同步">
          ✦
        </button>
        <button className="icon-btn bar-icon" onClick={onToggleTheme} title="切换 亮 / 暗">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button className="icon-btn bar-icon" onClick={onHelp} title="使用说明 · AI 接入">
          ?
        </button>
        <button className="icon-btn bar-icon" onClick={onSettings} title="设置 · 项目根目录">
          ⚙
        </button>
      </div>
    </div>
  )
}
