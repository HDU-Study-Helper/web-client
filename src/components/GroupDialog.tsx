import { useEffect, useId, useRef, useState } from 'react'
import { Check, MessageCircle, Search } from 'lucide-react'
import { api, dwsPath, errorMessage } from '../api'
import type { Group } from '../types'
import { Modal, Notice, Spinner, type ModalHandle } from './UI'

export default function GroupDialog({
  connection,
  onClose,
  onSaved,
  onReconcile,
}: {
  connection: string
  onClose: (savingPending: boolean) => void
  onSaved: () => void
  onReconcile: () => void
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
  const modalRef = useRef<ModalHandle>(null)
  const savePending = useRef(false)
  const discoveryController = useRef<AbortController | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)
  const descriptionId = useId()
  const limitId = useId()
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
      discoveryController.current?.abort()
      controller.abort()
    }
  }, [connection, version])
  async function more() {
    if (!alive.current || savePending.current || loading) return
    discoveryController.current?.abort()
    const controller = new AbortController()
    discoveryController.current = controller
    const requestedCursor = cursor
    setLoading(true)
    setDiscoveryError('')
    try {
      const page = await api<{ items: Group[]; has_more: boolean; next_cursor?: string }>(
        `${dwsPath(connection)}/available-groups${requestedCursor ? `?cursor=${encodeURIComponent(requestedCursor)}` : ''}`,
        { signal: controller.signal },
      )
      if (!alive.current || controller.signal.aborted) return
      if (page.has_more && (!page.next_cursor || page.next_cursor === requestedCursor))
        throw new Error('群列表分页未推进，请稍后重试。')
      setGroups((current) => [
        ...new Map([...current, ...(page.items || [])].map((group) => [group.id, group])).values(),
      ])
      setCursor(page.has_more ? page.next_cursor : undefined)
    } catch (error) {
      if (alive.current && !controller.signal.aborted) setDiscoveryError(errorMessage(error))
    } finally {
      if (alive.current && !controller.signal.aborted) setLoading(false)
    }
  }
  async function save() {
    if (!alive.current || savePending.current) return
    savePending.current = true
    setSaving(true)
    setError('')
    try {
      await api(`${dwsPath(connection)}/groups`, {
        method: 'PUT',
        // Dismissal must not pretend an in-flight server write was rolled back.
        signal: AbortSignal.timeout(10000),
        body: { groups: [...selected.values()] },
      })
      if (alive.current) modalRef.current?.close(onSaved)
    } catch (error) {
      if (alive.current) setError(errorMessage(error))
    } finally {
      savePending.current = false
      if (alive.current) setSaving(false)
      else onReconcile()
    }
  }
  const visible = groups.filter((group) =>
    `${group.name} ${group.id}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <Modal title="选择钉钉采集群" closeHandleRef={modalRef} onDismissStart={() => { alive.current = false; discoveryController.current?.abort() }} onClose={() => onClose(savePending.current)} busy={saving} descriptionId={descriptionId} initialFocusRef={searchRef}>
      <p className="modal-description" id={descriptionId}>
        只读取你勾选的群。选好课程群和班级群，让重要消息汇入 HAA。
      </p>
      <div className="input-with-icon group-search">
        <Search size={17} />
        <input
          ref={searchRef}
          aria-label="搜索已加载的群"
          placeholder="搜索已加载的群"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={saving}
        />
      </div>
      <p id={limitId} role="status" aria-live="polite" aria-atomic="true" className="group-limit">
        {selected.size >= 100
          ? '最多选择 100 个，请先取消一个。'
          : selected.size >= 90
            ? `还可选择 ${100 - selected.size} 个群。`
            : ''}
      </p>
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
              aria-describedby={!selected.has(group.id) && selected.size >= 100 ? limitId : undefined}
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
          <div className={`empty-state ${groups.length ? 'group-loading-more' : ''}`}>
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
            disabled={saving || loading}
            onClick={() => void more()}
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
