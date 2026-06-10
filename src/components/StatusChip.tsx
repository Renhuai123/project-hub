import type { Status } from '../data'

const MAP: Record<Status, { cls: string; label: string }> = {
  active: { cls: 'c-ing', label: '进行中' },
  done: { cls: 'c-done', label: '完成' },
  failed: { cls: 'c-fail', label: '搁置' },
}

export const RING_COLOR: Record<Status, string> = {
  active: 'var(--blue)',
  done: 'var(--green)',
  failed: 'var(--red)',
}

export function StatusChip({ status }: { status: Status }) {
  const s = MAP[status]
  return (
    <span className={`chip ${s.cls}`}>
      <span className="dot" />
      {s.label}
    </span>
  )
}
