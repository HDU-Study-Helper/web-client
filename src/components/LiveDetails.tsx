import { useState } from 'react'
import {
  localDateTime,
  platformLabel,
  useOfferingItems,
  type Offering,
  type PublicTodo,
  type Resource,
  type ScheduleEntry,
} from '../useWorkspaceData'
import { Modal, Notice } from './UI'

export function ResourceState({
  resource,
  empty,
}: {
  resource: Resource<unknown[]>
  empty: string
}) {
  if (resource.error)
    return (
      <div>
        <Notice tone="error">{resource.error}</Notice>
        <button type="button" className="text-button" onClick={resource.reload}>
          重试
        </button>
      </div>
    )
  if (resource.loading && !resource.data) return <p role="status">正在加载…</p>
  if (resource.data?.length === 0) return <p className="companion-note">{empty}</p>
  return null
}

export function LiveOfferingDetail({
  offering,
  onClose,
}: {
  offering: Offering
  onClose: () => void
}) {
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState('')
  const items = useOfferingItems(offering, offset)
  return (
    <Modal title={offering.name} onClose={onClose}>
      <p>
        {platformLabel(offering.source)}
        {offering.teacher ? ` · ${offering.teacher}` : ''}
      </p>
      {offering.description && <p className="live-body">{offering.description}</p>}
      <p className="detail-note">
        课程归档于 {localDateTime(offering.observed_at)} · 平台未提供统一课程进度
      </p>
      <h3>课程归档</h3>
      <ResourceState
        resource={items}
        empty={offset ? '没有更多归档事项。' : '此课程当前没有已关联的归档事项。'}
      />
      <div className="live-detail-list">
        {items.data?.map((item) => {
          const deadline = item.deadline?.value
            ? localDateTime(item.deadline.value)
            : item.deadline?.date || item.deadline?.raw
          return (
            <div key={item.item_id}>
              <button
                type="button"
                className="companion-task"
                aria-expanded={selected === item.item_id}
                onClick={() => setSelected((id) => (id === item.item_id ? '' : item.item_id))}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {(
                      {
                        assignment: '作业',
                        exam: '考试',
                        notice: '通知',
                        material: '资料',
                        discussion: '讨论',
                        chapter: '章节',
                        lesson: '课时',
                        progress: '进度',
                      } as Record<string, string>
                    )[item.kind] || item.kind}
                  </small>
                </span>
              </button>
              {selected === item.item_id && (
                <div className="live-body">
                  {deadline && <p>来源截止时间：{deadline}</p>}
                  {item.status && item.status !== 'unknown' && <p>归档状态：{item.status}</p>}
                  <p>{item.text || '没有可展示的归档正文。'}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={!offset || items.loading}
          onClick={() => {
            setSelected('')
            setOffset((value) => value - 12)
          }}
        >
          上一页
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={items.data?.length !== 12 || items.loading}
          onClick={() => {
            setSelected('')
            setOffset((value) => value + 12)
          }}
        >
          下一页
        </button>
      </div>
    </Modal>
  )
}

export function TodoDetail({ todo, onClose }: { todo: PublicTodo; onClose: () => void }) {
  return (
    <Modal title={todo.input.title} onClose={onClose}>
      <p>
        {todo.status === 'complete' ? '已完成' : '未完成'} ·{' '}
        {todo.input.due_at ? `截止 ${localDateTime(todo.input.due_at)}` : '未记录截止时间'}
      </p>
      <p className="live-body">{todo.input.body || '暂无待办补充说明。'}</p>
    </Modal>
  )
}

export function ScheduleDetail({ item, onClose }: { item: ScheduleEntry; onClose: () => void }) {
  const source =
    item.source === 'TIMETABLE' ? '教务课表' : item.source === 'AGENT' ? '助手创建' : '用户日程'
  return (
    <Modal title={item.title} onClose={onClose}>
      <p>
        {localDateTime(item.start_time)} 至 {localDateTime(item.end_time)} · {source}
      </p>
      <p className="live-body">{item.details || '暂无补充说明。'}</p>
    </Modal>
  )
}
