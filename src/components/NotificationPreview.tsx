import { useId, useState } from 'react'
import { ArrowUpRight, Bell, MessageCircle } from 'lucide-react'
import { Modal } from './UI'

const items = [
  { id: 'notice-lab', kind: '通知', title: '实验课分组安排已更新', source: '大学物理 · 课程通知', date: '11 / 12', body: '这是用于布局评估的模拟通知。正式接入后，这里将展示通知正文、来源及发布时间。当前不会读取真实平台消息。' },
  { id: 'notice-drawing', kind: '通知', title: '作业 2 提交前请检查文件命名', source: '工程制图 · 课程通知', date: '11 / 12', body: '模拟通知：提交前核对文件格式、命名和附件。这不是教师发布的真实要求，请以课程平台通知为准。' },
  { id: 'question-math', kind: '提问', title: '中值定理的使用条件怎么区分？', source: '高等数学 · 示例问题', date: '11 / 11', body: '模拟问题：罗尔定理与拉格朗日中值定理分别需要满足哪些条件？此处仅预览问题详情，不会提交问题或生成教师答复。' },
  { id: 'question-english', kind: '提问', title: '阅读报告需要包含哪些内容？', source: '大学英语 · 示例问题', date: '11 / 11', body: '这是问题详情的占位示例。后端接口接入后再确定提问、回复和状态流转；当前内容不会保存到账号。' },
]

export default function NotificationPreview() {
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState<(typeof items)[number]>()
  const description = useId()
  return <section className="study-module notification-preview" aria-label="通知与提问预览">
    <header className="module-heading"><h2><span className="module-subtitle">通知与提问</span></h2><span className="mock-label">Mock 预览</span></header>
    <p className="notification-disclaimer">模拟内容，仅用于版面展示；尚未接入后端。</p>
    <div className="notification-filters" role="group" aria-label="筛选通知与提问">
      {['全部', '通知', '提问'].map(kind => <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}
    </div>
    <div className="notification-items">
      {items.filter(item => filter === '全部' || item.kind === filter).map(item => <button type="button" className="notification-item" key={item.id} onClick={() => setSelected(item)}>
        <span className="notification-kind">{item.kind === '通知' ? <Bell size={16} /> : <MessageCircle size={16} />}<span>{item.kind}</span></span>
        <span className="notification-copy"><strong>{item.title}</strong><small>{item.source}</small></span>
        <time>{item.date}</time><ArrowUpRight size={14} aria-hidden="true" />
      </button>)}
    </div>
    {selected && <Modal title={selected.title} onClose={() => setSelected(undefined)} descriptionId={description}>
      <p className="modal-description" id={description}>Mock {selected.kind} · {selected.source}</p>
      <p className="notification-detail">{selected.body}</p>
    </Modal>}
  </section>
}
