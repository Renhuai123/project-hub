export function ProgressRing({
  pct,
  color,
  size = 60,
  stroke = 5,
  indeterminate = false,
}: {
  pct: number
  color: string
  size?: number
  stroke?: number
  indeterminate?: boolean
}) {
  const r = (size - stroke * 2) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  const center = size / 2
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--ringTrack)"
          strokeWidth={stroke}
          strokeDasharray={indeterminate ? '2 6' : undefined}
        />
        {!indeterminate && (
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)' }}
          />
        )}
      </svg>
      <div className="ring-pct mono" style={{ color: indeterminate ? 'var(--faint)' : color }}>
        {indeterminate ? '–' : `${pct}%`}
      </div>
    </div>
  )
}
