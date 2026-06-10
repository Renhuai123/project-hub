import { useEffect, useState } from 'react'
import { reconProject, type Recon } from '../data'
import { fmtSize, fmtAgo } from '../util'

// 项目侦察视图:没里程碑的项目,打开也能看清"文件夹里有什么"。
export function ReconView({ id }: { id: string }) {
  const [r, setR] = useState<Recon | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr('')
    setR(null)
    reconProject(id)
      .then((rec) => {
        if (!alive) return
        if (rec && rec.ok) setR(rec)
        else setErr(rec?.error || '侦察失败')
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setErr(String(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (loading) return <div className="recon-state mono">侦察文件夹中…</div>
  if (err) return <div className="recon-state mono">侦察失败:{err}</div>
  if (!r) return null

  return (
    <div className="recon">
      <div className="recon-stats">
        <span>
          <b>{r.fileCount}</b> 文件
        </span>
        <span>
          <b>{r.dirCount}</b> 目录
        </span>
        <span>
          <b>{fmtSize(r.totalSize)}</b>
          {r.truncated ? '+' : ''}
        </span>
        <span>
          最近 <b>{fmtAgo(r.mtime)}</b>
        </span>
        {r.git?.repo && (
          <span className="recon-git">
            ⎇ {r.git.branch || 'git'}
            {r.git.dirty ? ' · 有改动' : ''}
          </span>
        )}
      </div>

      {r.types.length > 0 && (
        <div className="recon-types">
          {r.types.map((t) => (
            <span key={t.ext} className="recon-type">
              {t.ext} <b>{t.count}</b>
            </span>
          ))}
        </div>
      )}

      <div className="recon-cols">
        <div className="recon-tree">
          <div className="recon-h mono">文件树{r.truncated ? '(部分)' : ''}</div>
          <ul>
            {r.tree.map((t, i) => (
              <li key={i} className={t.dir ? 'is-dir' : ''}>
                <span className="rt-ic">{t.dir ? '📁' : '📄'}</span>
                <span className="rt-name">{t.name}</span>
                {!t.dir && <span className="rt-size mono">{fmtSize(t.size)}</span>}
              </li>
            ))}
          </ul>
        </div>
        {r.readme ? (
          <div className="recon-readme">
            <div className="recon-h mono">{r.readme.name}</div>
            <pre>{r.readme.preview}</pre>
          </div>
        ) : (
          <div className="recon-readme empty mono">无 README / HANDOFF</div>
        )}
      </div>

      {r.git?.repo && r.git.lastCommit && (
        <div className="recon-commit mono">
          最近提交:{r.git.lastCommit.msg} · {r.git.lastCommit.iso?.slice(0, 10)}
        </div>
      )}
    </div>
  )
}
