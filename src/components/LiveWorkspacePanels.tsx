import { CalendarDays, CircleAlert, Clock3 } from 'lucide-react'
import {
  addDay,
  dateLabel,
  localDateTime,
  platformLabel,
  scheduleTime,
  schedulesOn,
  type Offering,
  type PublicTodo,
  type Resource,
  type ScheduleEntry,
} from '../useWorkspaceData'
import { ResourceState } from './LiveDetails'

export function LiveScheduleList({
  items,
  onSelect,
}: {
  items: ScheduleEntry[]
  onSelect: (value: ScheduleEntry) => void
}) {
  return (
    <ol className="schedule-list detailed">
      {items.map((item) => (
        <li key={item.id}>
          <span className="timeline-dot" />
          <time dateTime={item.start_time}>
            {scheduleTime(item.start_time)}
            <span> — </span>
            {scheduleTime(item.end_time)}
          </time>
          <div>
            <button type="button" className="text-button" onClick={() => onSelect(item)}>
              {item.title}
            </button>
          </div>
          <span className="schedule-type">
            {item.source === 'TIMETABLE'
              ? '课表'
              : item.source === 'AGENT'
                ? '助手日程'
                : '个人日程'}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function LiveToday({
  schedules,
  today,
  onSelect,
}: {
  schedules: Resource<ScheduleEntry[]>
  today: string
  onSelect: (value: ScheduleEntry) => void
}) {
  const items = schedulesOn(schedules.data, today)
  return (
    <>
      <ResourceState
        resource={{ ...schedules, data: schedules.data ? items : undefined }}
        empty="今天暂无日程。"
      />
      {!!items.length && <LiveScheduleList items={items} onSelect={onSelect} />}
      <footer className="module-footnote">
        <Clock3 size={12} /> {dateLabel(today)} · 北京时间
      </footer>
    </>
  )
}

export function LiveTimeLine({
  schedules,
  today,
  selected,
  onDay,
  onSelect,
}: {
  schedules: Resource<ScheduleEntry[]>
  today: string
  selected: number
  onDay: (i: number) => void
  onSelect: (value: ScheduleEntry) => void
}) {
  const rows = Array.from({ length: 4 }, (_, i) => addDay(today, i)).map((day) => ({
    day,
    items: schedulesOn(schedules.data, day),
  }))
  const current = rows[selected] ?? rows[0]
  return (
    <>
      <div className="schedule-dates">
        {rows.map(({ day, items }, i) => (
          <button
            type="button"
            key={day}
            aria-pressed={selected === i}
            className={selected === i ? 'selected' : ''}
            onClick={() => onDay(i)}
          >
            {dateLabel(day)}
            {schedules.data && <span>{items.length} 项安排</span>}
          </button>
        ))}
      </div>
      <section className="study-module">
        <header className="module-heading">
          <h2 className="module-subtitle">时间线 · {dateLabel(current.day)}</h2>
        </header>
        <ResourceState resource={schedules} empty="所查日期范围暂无日程。" />
        {!!current.items.length && <LiveScheduleList items={current.items} onSelect={onSelect} />}
        {!!schedules.data?.length && !current.items.length && (
          <div className="schedule-empty">
            <CalendarDays size={30} />
            <p>这一天暂无日程。</p>
          </div>
        )}
      </section>
    </>
  )
}

export function LiveTodos({
  resource,
  onSelect,
  brief = false,
  reminders = true,
}: {
  resource: Resource<PublicTodo[]>
  onSelect: (todo: PublicTodo) => void
  brief?: boolean
  reminders?: boolean
}) {
  const open = resource.data
    ?.filter((item) => item.status === 'open')
    .sort(
      (a, b) =>
        (a.input.due_at ? Date.parse(a.input.due_at) : Infinity) -
        (b.input.due_at ? Date.parse(b.input.due_at) : Infinity),
    )
  if (brief && !reminders) return <p>已隐藏本页待办提示，不影响已保存的通知或计划。</p>
  return (
    <>
      {brief && !!open?.length && (
        <div className="brief-card">
          <h3>
            <CircleAlert size={17} /> {open.length} 项未完成待办
          </h3>
          <p>显示当前账号公开待办，按已知截止时间排序。</p>
        </div>
      )}
      <ResourceState resource={{ ...resource, data: open }} empty="暂无未完成的公开待办。" />
      {open?.slice(0, brief ? 2 : undefined).map((item) => (
        <button
          key={item.id}
          type="button"
          className="companion-task"
          onClick={() => onSelect(item)}
        >
          <span>
            <strong>{item.input.title}</strong>
            <small>
              {item.input.due_at ? `截止 ${localDateTime(item.input.due_at)}` : '未记录截止时间'}
            </small>
          </span>
        </button>
      ))}
    </>
  )
}

export function LiveCourses({
  resource,
  expanded,
  onExpand,
  onSelect,
}: {
  resource: Resource<Offering[]>
  expanded: boolean
  onExpand: () => void
  onSelect: (course: Offering) => void
}) {
  const courses = resource.data || []
  return (
    <>
      <ResourceState resource={resource} empty="暂无未停采的平台课程。" />
      {!!courses.length && (
        <div className="course-table" role="group" aria-label="已归档平台课程">
          <div className="course-table-head">
            <span>课程</span>
            <span>来源</span>
            <span>教师</span>
          </div>
          {courses.slice(0, expanded ? undefined : 3).map((course) => (
            <button
              type="button"
              key={course.offering_id}
              className="course-row"
              aria-label={`查看${course.name}详情`}
              onClick={() => onSelect(course)}
            >
              <span className="course-name">
                <span className="course-code code-blue">{course.name.slice(0, 1)}</span>
                <strong>{course.name}</strong>
              </span>
              <span className="progress-cell">{platformLabel(course.source)}</span>
              <span className="course-task">{course.teacher || '未记录'}</span>
            </button>
          ))}
        </div>
      )}
      {courses.length > 3 && (
        <button type="button" className="all-courses" onClick={onExpand}>
          {expanded ? '收起课程' : `查看全部 ${courses.length} 个开课实例`}
        </button>
      )}
    </>
  )
}
