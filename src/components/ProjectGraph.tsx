import { useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Position,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { type Project, projectProgress, branchProgress } from '../data'
import { ProgressRing } from './ProgressRing'

function brColor(pct: number) {
  return pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--blue)' : 'var(--faint)'
}

// 节点测量完后 fit(容器尺寸 / 布局签名变化都重 fit),避免溢出 / 节点被切。
// sig 变(如切换方法视图多一排)时,等新坐标 commit 完(双 rAF + 兜底)再 fit,
// 否则会用旧坐标 fit 导致底部合体节点被裁。
function Fitter({ sig }: { sig: string }) {
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!initialized) return
    const fit = () => fitView({ padding: 0.1, duration: 0, maxZoom: 2 })
    let r1 = 0
    let r2 = 0
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(fit)
    })
    const t = setTimeout(fit, 320)
    const el = document.querySelector('.detail-graph')
    const ro = el ? new ResizeObserver(fit) : null
    if (el && ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
      clearTimeout(t)
      ro?.disconnect()
    }
  }, [initialized, fitView, sig])
  return null
}

// 上 → 下:开头(目标) → [方法卡:谁+什么skill] → 各分支(带进度环) → 汇聚/合体到 结尾。
// methodView 关时不显示方法卡,goal 直接连分支。
export function ProjectGraph({
  project,
  onSelectBranch,
  methodView,
}: {
  project: Project
  onSelectBranch: (i: number | null) => void
  methodView: boolean
}) {
  const prog = projectProgress(project)
  const N = project.branches.length
  // 分支少 = 稀疏图:节点放大(更宽 + 字更大 + 横向间距加大),否则细高的链塞进宽画布会缩太小
  const sparse = N <= 2
  const big = sparse ? ' rf-big' : ''
  const GAPX = sparse ? 320 : 198
  const BR_W = sparse ? 268 : 168
  const rowCenter = ((N - 1) * GAPX + BR_W) / 2

  // 纵向间距:分支越少越收紧。稀疏(big)模式 goal 节点更高(~122px),
  // 方法卡/分支/成果整体下移,避免方法卡被目标节点压住(标题限 1 行界定高度)。
  const methodY = sparse ? 150 : 110
  const branchY = methodView ? (sparse ? 242 : 214) : sparse ? 138 : 162
  const outcomeY = methodView ? (sparse ? 356 : 372) : sparse ? 268 : 318

  const nodes: Node[] = []
  const edges: Edge[] = []

  nodes.push({
    id: 'goal',
    position: { x: rowCenter - 96, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    className: `rf-node rf-goal${big}`,
    data: {
      label: (
        <div className="rfn">
          <div className="rfn-k">开头 · 目标</div>
          <div className="rfn-title">{project.name}</div>
          <div className="rfn-sub">{project.goal || project.tagline}</div>
        </div>
      ),
    },
  })

  project.branches.forEach((b, i) => {
    const bp = branchProgress(b)
    const c = brColor(bp.pct)
    const bx = i * GAPX

    nodes.push({
      id: `b${i}`,
      position: { x: bx, y: branchY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      className: `rf-node rf-branch${big}`,
      data: {
        label: (
          <div className="rfn rfn-branch">
            <ProgressRing pct={bp.pct} color={c} size={38} stroke={4} indeterminate={bp.total === 0} />
            <div className="rfn-bcol">
              <div className="rfn-bname">{b.name}</div>
              <div className="rfn-sub">
                {bp.done}/{bp.total} 里程碑
              </div>
            </div>
          </div>
        ),
      },
    })

    if (methodView) {
      const skills = b.by?.skills && b.by.skills.length ? b.by.skills.join(', ') : ''
      nodes.push({
        id: `m${i}`,
        position: { x: bx + 6, y: methodY },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        className: 'rf-node rf-method',
        data: {
          label: (
            <div className="rfn-method">
              <div className="rfm-agent">🤖 {b.by?.agent ?? '未标注'}</div>
              <div className="rfm-skills">{skills ? `🧩 ${skills}` : '— 无 skill'}</div>
            </div>
          ),
        },
      })
      edges.push({ id: `g-m${i}`, source: 'goal', target: `m${i}`, type: 'bezier', animated: true, style: { stroke: c, strokeWidth: 1.4, opacity: 0.5 } })
      edges.push({ id: `m-b${i}`, source: `m${i}`, target: `b${i}`, type: 'bezier', animated: true, style: { stroke: c, strokeWidth: 1.6, opacity: 0.6 } })
    } else {
      edges.push({ id: `g-${i}`, source: 'goal', target: `b${i}`, type: 'bezier', animated: true, style: { stroke: c, strokeWidth: 1.6, opacity: 0.6 } })
    }

    edges.push({ id: `${i}-o`, source: `b${i}`, target: 'outcome', type: 'bezier', animated: true, style: { stroke: c, strokeWidth: 2.2, opacity: 0.85 } })
  })

  const outColor = prog.known ? (prog.pct >= 100 ? 'var(--green)' : 'var(--blue)') : 'var(--faint)'
  nodes.push({
    id: 'outcome',
    position: { x: rowCenter - 100, y: outcomeY },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    className: `rf-node rf-outcome${big}`,
    data: {
      label: (
        <div className="rfn rfn-outcome">
          <div className="rfn-k">结尾 · 成果 · 合体</div>
          <ProgressRing pct={prog.pct} color={outColor} size={64} stroke={6} indeterminate={!prog.known} />
          <div className="rfn-sub">{project.outcome ?? (prog.known ? `总进度 ${prog.pct}%` : '待估算')}</div>
        </div>
      ),
    },
  })

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.1, maxZoom: 2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeMouseEnter={(_, node) => {
        if (node.id.startsWith('b')) onSelectBranch(Number(node.id.slice(1)))
      }}
      onNodeClick={(_, node) => {
        if (node.id.startsWith('b')) onSelectBranch(Number(node.id.slice(1)))
      }}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1} color="var(--line)" />
      <Fitter sig={`${methodView ? 'm' : 'p'}${N}`} />
    </ReactFlow>
  )
}
