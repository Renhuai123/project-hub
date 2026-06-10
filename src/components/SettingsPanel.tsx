import { useEffect, useState } from 'react'
import { getConfig, setConfig, type HubConfig } from '../data'

// 设置(右上角 ⚙):扫描根目录 + 称呼。保存即热生效(Rust 侧重建文件监听,无需重启)。
// onboarding:首次启动(扫不到任何项目)时由 App 自动打开。
export function SettingsPanel({
  open,
  onClose,
  onSaved,
  firstRun,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  firstRun?: boolean
}) {
  const [roots, setRoots] = useState<string[]>([])
  const [userName, setUserName] = useState('')
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    getConfig()
      .then((c) => {
        setRoots(c.roots ?? [])
        setUserName(c.userName ?? '')
        setErr('')
      })
      .catch((e) => setErr(String(e)))
  }, [open])

  const addRoot = () => {
    const v = draft.trim()
    if (!v) return
    if (roots.includes(v)) {
      setDraft('')
      return
    }
    setRoots([...roots, v])
    setDraft('')
  }

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
      await setConfig({ roots, userName: userName.trim() })
      onSaved()
      onClose()
    } catch (e) {
      // Rust 侧校验目录存在性,错误信息形如「目录不存在: /xxx」
      setErr(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={`ai-scrim${open ? ' open' : ''}`} onClick={firstRun ? undefined : onClose} />
      <aside className={`ai-panel${open ? ' open' : ''}`} role="dialog" aria-label="设置">
        <div className="ai-head">
          <div className="ai-title">⚙ 设置</div>
          {!firstRun && (
            <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
              ✕
            </button>
          )}
        </div>

        <div className="hp-body">
          {firstRun && (
            <div className="sp-welcome">
              <b>欢迎使用项目中枢 👋</b>
              <p className="hp-p">先告诉我你的项目都放在哪个文件夹——根目录下的每个子文件夹会变成一张项目卡片。</p>
            </div>
          )}

          <div className="hp-h">项目根目录</div>
          <p className="hp-p">看板扫描这些目录的直接子文件夹;支持 ~ 开头。保存后立即生效并开启文件监听。</p>
          <div className="sp-roots">
            {roots.map((r) => (
              <div className="sp-root" key={r}>
                <code className="mono">{r}</code>
                <button className="hp-copy" onClick={() => setRoots(roots.filter((x) => x !== r))}>
                  移除
                </button>
              </div>
            ))}
            {roots.length === 0 && <div className="sp-empty mono">未配置 · 当前用内置默认目录</div>}
          </div>
          <div className="sp-add">
            <input
              className="sp-input mono"
              placeholder="~/Projects 或 /Users/you/work"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRoot()
              }}
            />
            <button className="hp-copy" onClick={addRoot}>
              + 添加
            </button>
          </div>

          <div className="hp-h">怎么称呼你</div>
          <input
            className="sp-input"
            placeholder="顶栏问候用,留空则不显示"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            maxLength={24}
          />

          {err && <div className="sp-err">{err}</div>}

          <button className="sp-save" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存并生效'}
          </button>
        </div>
      </aside>
    </>
  )
}
