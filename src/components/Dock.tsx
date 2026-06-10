// 底部浮动 dock —— 借鉴 wanman 的画布式控制条:把高频动作收进一个悬浮圆角条,
// 壁纸层下更轻、不抢内容。AI 自管为主,主题切换 + 回到顶部为辅。
export function Dock({
  theme,
  onToggle,
  onAiOpen,
  hidden,
}: {
  theme: 'light' | 'dark'
  onToggle: () => void
  onAiOpen: () => void
  hidden?: boolean
}) {
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
  return (
    <div className={`dock${hidden ? ' hidden' : ''}`} role="toolbar" aria-label="快捷操作">
      <button
        className="dock-ai mono"
        onClick={onAiOpen}
        title="AI 自管:本地 AI 经接口增删改项目,桌面实时同步"
      >
        ✦ AI 自管
      </button>
      <div className="dock-sep" />
      <button className="dock-icon" onClick={onToggle} title="切换 亮 / 暗">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <button className="dock-icon" onClick={toTop} title="回到顶部">
        ⬆
      </button>
    </div>
  )
}
