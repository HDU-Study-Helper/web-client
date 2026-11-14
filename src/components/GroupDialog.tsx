import { useEffect, useRef, useState } from 'react'
import { Check, MessageCircle, Search } from 'lucide-react'
import { api, dwsPath, errorMessage } from '../api'
import type { Group } from '../types'
import { Modal, Notice, Spinner } from './UI'

export default function GroupDialog({
  connection,
  onClose,
  onSaved,
}: {
  connection: string
  onClose: () => void
  onSaved: () => void
}) {
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState<Map<string, Group>>(new Map())
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [discoveryError, setDiscoveryError] = useState('')
  const [version, setVersion] = useState(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    setLoading(true)
    setLoaded(false)
    setError('')
    setDiscoveryError('')
    async function load() {
      // Read the saved allowlist first; discovery failure must never clear it.
      try {
        const saved = await api<{ items: Group[] }>(`${dwsPath(connection)}/groups`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setSelected(new Map((saved.items || []).map((group) => [group.id, group])))
        setGroups(saved.items || [])
        setLoaded(true)
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(errorMessage(error))
          setLoading(false)
        }
        return
      }
      try {
        const page = await api<{ items: Group[]; has_more: boolean; next_cursor?: string }>(
          `${dwsPath(connection)}/available-groups`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        setGroups((current) => [
          ...new Map(
            [...current, ...(page.items || [])].map((group) => [group.id, group]),
          ).values(),
        ])
        setCursor(page.has_more ? page.next_cursor : undefined)
      } catch (error) {
        if (!controller.signal.aborted) setDiscoveryError(errorMessage(error))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [connection, version])
  async function more() {
    setLoading(true)
    setDiscoveryError('')
    try {
      const page = await api<{ items: Group[]; has_more: boolean; next_cursor?: string }>(
        `${dwsPath(connection)}/available-groups?cursor=${encodeURIComponent(cursor!)}`,
      )
      if (!alive.current) return
      if (page.has_more && (!page.next_cursor || page.next_cursor === cursor))
        throw new Error('群列表分页未推进，请稍后重试。')
      setGroups((current) => [
        ...new Map([...current, ...(page.items || [])].map((group) => [group.id, group])).values(),
      ])
      setCursor(page.has_more ? page.next_cursor : undefined)
    } catch (error) {
      if (alive.current) setDiscoveryError(errorMessage(error))
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  async function save() {
    setSaving(true)
    setError('')
    try {
      await api(`${dwsPath(connection)}/groups`, {
        method: 'PUT',
        body: { groups: [...selected.values()] },
      })
      onSaved()
    } catch (error) {
      if (alive.current) setError(errorMessage(error))
    } finally {
      if (alive.current) setSaving(false)
    }
  }
  const visible = groups.filter((group) =>
    `${group.name} ${group.id}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <Modal title="选择钉钉采集群" onClose={onClose} busy={saving}>
      <p className="modal-description">
        只读取你勾选的群。选好课程群和班级群，让重要消息汇入 HAA。
      </p>
      <div className="input-with-icon group-search">
        <Search size={17} />
        <input
          aria-label="搜索已加载的群"
          placeholder="搜索已加载的群"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={saving}
        />
      </div>
      <div className="group-list" aria-busy={loading}>
        {visible.map((group) => (
          <label className={`group-row ${selected.has(group.id) ? 'selected' : ''}`} key={group.id}>
            <span className="group-avatar">
              <MessageCircle size={19} />
            </span>
            <span className="group-name">{group.name || group.id}</span>
            <input
              type="checkbox"
              checked={selected.has(group.id)}
              disabled={saving || (!selected.has(group.id) && selected.size >= 100)}
              onChange={(event) => {
                const checked = event.target.checked
                setSelected((current) => {
                  const next = new Map(current)
                  if (checked) next.set(group.id, group)
                  else next.delete(group.id)
                  return next
                })
              }}
            />
          </label>
        ))}
        {loading && (
          <div className="empty-state">
            <Spinner />
            正在读取群列表…
          </div>
        )}
        {!loading && !visible.length && (
          <div className="empty-state">
            <MessageCircle size={26} />
            <p>{search ? '没有找到匹配的群' : '暂无可选择的群，可稍后回来配置。'}</p>
          </div>
        )}
      </div>
      {cursor && (
        <button
          className="text-button load-more"
          onClick={() => void more()}
          disabled={loading || saving}
        >
          加载更多群
        </button>
      )}
      {error && (
        <Notice tone="error">
          {error}
          {!loaded && (
            <button className="text-button" onClick={() => setVersion((value) => value + 1)}>
              重新加载
            </button>
          )}
        </Notice>
      )}
      {discoveryError && (
        <Notice tone="error">
          未能完整加载可选群：{discoveryError} 已有选择会保留。
          <button
            className="text-button"
            onClick={() => (cursor ? void more() : setVersion((value) => value + 1))}
          >
            重试加载
          </button>
        </Notice>
      )}
      <div className="modal-actions">
        <span className="muted">
          已选择 <strong>{selected.size}</strong> / 100 个群
        </span>
        <button
          className="button button-primary"
          disabled={!loaded || saving || loading || selected.size > 100}
          onClick={() => void save()}
        >
          {saving ? <Spinner /> : <Check size={16} />}保存选择
        </button>
      </div>
    </Modal>
  )
}
