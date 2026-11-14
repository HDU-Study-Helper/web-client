import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  CornerDownLeft,
  House,
  Layers3,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import type { User } from '../types'
import {
  academicSnapshot,
  brief,
  chatCopy,
  courses,
  mockReply,
  schedule,
  scheduleDays,
  suggestedQuestions,
  type MockCourse,
} from '../data/mock'
import PixelComputer from './PixelComputer'
import { Brand, Modal, Notice } from './UI'
import '../workspace.css'

type Page = 'home' | 'chat' | 'schedule' | 'profile'
type Message = { id: number; role: 'user' | 'assistant'; text: string; sources?: string[] }
const questionIcons = { calendar: CalendarDays, book: BookOpen, trend: TrendingUp, target: Target }
const navigation = [
  { id: 'home', label: '主页', icon: House },
  { id: 'chat', label: '对话', icon: MessageCircle },
  { id: 'schedule', label: '日程', icon: CalendarDays },
  { id: 'profile', label: '我的', icon: UserRound },
] as const

function Module({
  number,
  title,
  subtitle,
  label,
  children,
  className = '',
  action,
}: {
  number: string
  title: string
  subtitle: string
  label?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`study-module ${className}`}>
      <header className="module-heading">
        <h2>
          <span className="module-index">{number}</span>
          <span className="pixel-type">{title}</span>
          <span className="module-subtitle">{subtitle}</span>
        </h2>
        {action || <span className="module-label">// {label}</span>}
      </header>
      {children}
    </section>
  )
}

function ScheduleList({ detailed = false }: { detailed?: boolean }) {
  return (
    <ol className={`schedule-list ${detailed ? 'detailed' : ''}`}>
      {schedule.map((item, i) => (
        <li key={item.id} className={i === 0 ? 'next-class' : ''}>
          <span className="timeline-dot" />
          <time>
            {item.start}
            <span> — </span>
            {item.end}
          </time>
          <div>
            <strong>{item.name}</strong>
            {detailed && <p>{item.location}</p>}
          </div>
          {detailed && <span className="schedule-type">{item.type}</span>}
        </li>
      ))}
    </ol>
  )
}

export default function Workspace({
  user,
  preview = false,
  onLogout,
  onSettings,
}: {
  user: User
  preview?: boolean
  onLogout: () => Promise<void>
  onSettings: () => void
}) {
  const [page, setPage] = useState<Page>('home')
  const [clock, setClock] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [course, setCourse] = useState<MockCourse>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [replying, setReplying] = useState(false)
  const [notice, setNotice] = useState('')
  const [reminders, setReminders] = useState(true)
  const [selectedDay, setSelectedDay] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingReply = useRef(false)
  const nextId = useRef(0)
  const name = user.display_name || user.username
  const hours = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      timeZone: 'Asia/Shanghai',
      hourCycle: 'h23',
    }).format(clock),
  )
  const greeting = hours < 12 ? 'GOOD MORNING' : hours < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING'
  const date = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(clock)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(clock)
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000)
    return () => {
      clearInterval(timer)
      clearTimeout(replyTimer.current)
    }
  }, [])
  useEffect(() => {
    const el = conversationRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, replying, page])
  useEffect(() => {
    if (page === 'chat') inputRef.current?.focus({ preventScroll: true })
  }, [page])

  function navigate(next: Page) {
    setPage(next)
    if (next === 'chat') inputRef.current?.focus({ preventScroll: true })
  }
  function send(text: string) {
    const value = text.trim()
    if (!value || pendingReply.current) return
    pendingReply.current = true
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text: value }])
    setInput('')
    setReplying(true)
    replyTimer.current = setTimeout(() => {
      const reply = mockReply(value)
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', ...reply }])
      pendingReply.current = false
      setReplying(false)
    }, chatCopy.delay)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    send(input)
  }
  function clearChat() {
    clearTimeout(replyTimer.current)
    pendingReply.current = false
    setReplying(false)
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="study-os">
      <a className="skip-link" href="#dashboard">
        跳到工作台
      </a>
      <header className="os-header">
        <button
          className="os-brand"
          onClick={() => navigate('home')}
          aria-label="Academic Assistant 主页"
        >
          <Brand small />
          <span className="os-version">
            v0.1 <span>Study OS</span>
          </span>
        </button>
        <nav className="os-navigation" aria-label="主导航">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="os-system">
          <span className="system-state">
            <i />
            系统就绪
          </span>
          <span className="os-clock">
            <span>
              {clock
                .toLocaleDateString('en-CA', {
                  month: '2-digit',
                  day: '2-digit',
                  timeZone: 'Asia/Shanghai',
                })
                .replace('/', '-')}
            </span>
            <time>{time}</time>
          </span>
        </div>
      </header>

      <div className="workspace-meta">
        <span>
          <span className="status-square" /> PERSONAL ACADEMIC WORKSTATION
        </span>
        <span>
          本地示例 <span className="meta-divider">/</span> {academicSnapshot.semester}{' '}
          <span className="meta-divider">/</span> {academicSnapshot.week}
        </span>
      </div>
      <main className={`workspace-main ${page === 'home' || page === 'chat' ? '' : 'single-view'}`}>
        <div
          className="dashboard-scroll"
          id="dashboard"
          tabIndex={-1}
          hidden={page !== 'home' && page !== 'chat'}
        >
          <section className="welcome-panel">
            <PixelComputer />
            <div className="welcome-copy">
              <span className="welcome-kicker">A NEW DAY, A LITTLE PROGRESS.</span>
              <h1 className="pixel-type">
                {greeting}, {name.toUpperCase()}!<span className="cursor-block" />
              </h1>
              <p>
                今天是 {date} <span>·</span> 你的学业概览
              </p>
            </div>
            <svg className="mountain-art" viewBox="0 0 300 130" aria-hidden="true">
              <defs>
                <pattern id="halftone" width="3" height="3" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r=".6" fill="#596f9a" />
                </pattern>
              </defs>
              <path
                d="m0 130 50-36 29 9 39-44 21 9 52-60 18 4 71 90 20-17v45Z"
                fill="url(#halftone)"
              />
              <path d="m65 130 39-23 28 6 49-45 21 4 47-34 51 46v46Z" fill="#c5c8cc" opacity=".3" />
            </svg>
          </section>

          <Module
            number="01"
            title="OVERVIEW"
            subtitle="学业总览"
            label="ACADEMIC STATUS"
            className="overview-module"
          >
            <div className="overview-grid">
              {[
                {
                  icon: ClipboardCheck,
                  value: academicSnapshot.pendingTasks,
                  label: '待完成任务',
                  color: 'blue',
                },
                {
                  icon: CalendarDays,
                  value: academicSnapshot.todayClasses,
                  label: '今日课程',
                  color: 'sand',
                },
                { icon: Layers3, value: courses.length, label: '进行中课程', color: 'green' },
              ].map(({ icon: Icon, value, label, color }) => (
                <div className={`stat stat-${color}`} key={label}>
                  <span className="stat-icon">
                    <Icon size={29} strokeWidth={1.5} />
                  </span>
                  <div>
                    <strong className="pixel-type">{String(value).padStart(2, '0')}</strong>
                    <span>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </Module>

          <div className="dashboard-middle">
            <Module
              number="02"
              title="TODAY’S SCHEDULE"
              subtitle="今日安排"
              label="TODAY"
              className="today-module"
              action={
                <button
                  className="module-action"
                  onClick={() => navigate('schedule')}
                  aria-label="查看完整日程"
                >
                  <ArrowUpRight size={16} />
                </button>
              }
            >
              <ScheduleList />
              <footer className="module-footnote">
                <Clock3 size={12} /> 示例日程 · {academicSnapshot.dateLabel}
              </footer>
            </Module>
            <Module
              number="03"
              title="AGENT BRIEF"
              subtitle="学业简报"
              label="NOTICE"
              className="brief-module"
            >
              <div className="brief-card">
                <h3>
                  <CircleAlert size={17} />
                  {reminders ? brief.title : '学业提醒已暂停'}
                </h3>
                <p>
                  {reminders
                    ? brief.description
                    : '你可以在「我的」中重新开启提醒。课程任务仍可在下方查看。'}
                </p>
              </div>
              <button className="brief-link" onClick={() => setCourse(courses[1])}>
                查看待办详情 <ArrowRight size={15} />
              </button>
              {reminders && <p className="brief-hint">{brief.suggestion}</p>}
            </Module>
          </div>

          <Module
            number="04"
            title="COURSE STATUS"
            subtitle="我的课程"
            label="PROGRESS"
            className="courses-module"
          >
            <div className="course-table" role="group" aria-label="课程学习进度">
              <div className="course-table-head">
                <span>课程</span>
                <span>学习进度</span>
                <span>近期任务</span>
              </div>
              {courses.slice(0, expanded ? courses.length : 3).map((c) => (
                <button
                  className="course-row"
                  key={c.id}
                  onClick={() => setCourse(c)}
                  aria-label={`查看${c.name}详情`}
                >
                  <span className="course-name">
                    <span className={`course-code code-${c.color}`}>{c.code}</span>
                    <strong>{c.name}</strong>
                  </span>
                  <span className="progress-cell">
                    <span
                      className="segmented-progress"
                      role="progressbar"
                      aria-label={`${c.name}学习进度`}
                      aria-valuenow={c.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${c.progress}%` }} />
                    </span>
                    <b>{c.progress}%</b>
                  </span>
                  <span className="course-task">
                    {c.due ? (
                      <>
                        <span className="task-dot">·</span>
                        {c.task}
                        <small>{c.due}</small>
                        {c.id === 'drawing' && <CircleAlert size={14} className="urgent-icon" />}
                      </>
                    ) : (
                      <span className="no-task">暂无待交任务</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <button className="all-courses" onClick={() => setExpanded(!expanded)}>
              {expanded ? '收起课程' : `查看全部 ${courses.length} 门课程`}
              <ChevronDown size={13} className={expanded ? 'rotate' : ''} />
            </button>
          </Module>
          <p className="dashboard-end">
            <span>✦</span> 学习不必匆忙，每一步都算数。<span className="mono">END OF OVERVIEW</span>
          </p>
        </div>

        <section
          className="assistant-console"
          aria-label="Academic Assistant 对话区域"
          hidden={page !== 'home' && page !== 'chat'}
        >
          <header className="console-heading">
            <span className="console-prompt">›_</span>
            <h2 className="pixel-type">
              ACADEMIC ASSISTANT <span>学习助手</span>
            </h2>
            <span className="console-status">
              <i />
              READY
            </span>
          </header>
          <div className="conversation-scroll" ref={conversationRef}>
            <div className={`assistant-onboarding ${messages.length ? 'compact' : ''}`}>
              <div className="assistant-greeting">
                <PixelComputer happy />
                <div className="greeting-bubble">
                  <span className="assistant-label">YOUR ACADEMIC COMPANION</span>
                  <h3 className="pixel-type">{chatCopy.welcome}</h3>
                  <p>{academicSnapshot.assistantIntro}</p>
                </div>
              </div>
              <div className="suggested-area">
                <div className="suggested-heading">
                  <span className="question-mark">?</span>
                  <h3>不妨，从这里开始</h3>
                  <span>TRY ASKING</span>
                </div>
                <div className="suggested-grid">
                  {suggestedQuestions.map((q) => {
                    const Icon = questionIcons[q.icon as keyof typeof questionIcons]
                    return (
                      <button key={q.id} onClick={() => send(q.prompt)} disabled={replying}>
                        <Icon size={21} strokeWidth={1.7} />
                        <span>{q.text}</span>
                        <ArrowUpRight size={13} className="question-arrow" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            {messages.length === 0 ? (
              <div className="console-idle" aria-hidden="true">
                <div className="idle-spark">✳</div>
                <p>留一点空间，给新的想法。</p>
                <span className="mono">LESS NOISE. MORE FOCUS.</span>
              </div>
            ) : (
              <div
                className="message-list"
                role="log"
                aria-label="对话消息"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {messages.map((m) => (
                  <article key={m.id} className={`chat-message message-${m.role}`}>
                    <div className="message-author">
                      {m.role === 'assistant' ? (
                        <>
                          <span className="message-avatar">a_</span>
                          <strong>Academic Assistant</strong>
                          <span className="local-label">本地演示</span>
                        </>
                      ) : (
                        <>
                          <span className="user-message-avatar">
                            <UserRound size={13} />
                          </span>
                          <strong>{name}</strong>
                          <span className="mono">YOU</span>
                        </>
                      )}
                    </div>
                    <div className="message-body">{m.text}</div>
                    {!!m.sources?.length && (
                      <div className="message-sources">
                        {m.sources.map((source) => (
                          <span key={source}>
                            <BookOpen size={11} />
                            {source}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
                {replying && (
                  <div className="typing-indicator" role="status">
                    <span />
                    <span />
                    <span />
                    <small>正在整理思路…</small>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="console-bottom">
            <div className="console-tools">
              <span>
                <span className="status-square" /> 学习模式 <span className="tool-divider">/</span>{' '}
                本地演示
              </span>
              <button disabled={!messages.length} onClick={clearChat}>
                <Plus size={13} />
                新对话
              </button>
            </div>
            <form className="chat-composer" onSubmit={submit}>
              <label htmlFor="assistant-input" className="sr-only">
                向学习助手提问
              </label>
              <span className="input-prompt">›</span>
              <textarea
                ref={inputRef}
                id="assistant-input"
                rows={2}
                maxLength={2000}
                placeholder={chatCopy.placeholder}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send(input)
                  }
                }}
              />
              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || replying}
                aria-label="发送消息"
              >
                <Send size={22} strokeWidth={1.5} />
              </button>
            </form>
            <div className="composer-hint">
              <span>{chatCopy.note}</span>
              <span>
                <CornerDownLeft size={11} /> 发送 <span className="tool-divider">·</span> Shift +
                Enter 换行
              </span>
            </div>
          </div>
        </section>

        {page === 'schedule' && (
          <section className="standalone-page">
            <header className="standalone-title">
              <div>
                <span className="eyebrow">05 / MY SCHEDULE</span>
                <h1 className="pixel-type">给每一天，一点秩序。</h1>
                <p>把课堂与自己的时间，都安排妥当。</p>
              </div>
              <span className="local-page-badge">本地示例</span>
            </header>
            <div className="schedule-dates">
              {scheduleDays.map((day, i) => (
                <button
                  key={day}
                  className={selectedDay === i ? 'selected' : ''}
                  aria-pressed={selectedDay === i}
                  onClick={() => setSelectedDay(i)}
                >
                  {day}
                  {i === 0 && <span>3 项安排</span>}
                </button>
              ))}
            </div>
            <Module number="01" title="DAILY TIMELINE" subtitle="每日时间线" label="SCHEDULE">
              {selectedDay === 0 ? (
                <ScheduleList detailed />
              ) : (
                <div className="schedule-empty">
                  <CalendarDays size={34} strokeWidth={1} />
                  <h2>这一天，还留有空白。</h2>
                  <p>当前示例没有安排，给自己留一点自由时间。</p>
                </div>
              )}
            </Module>
            <p className="standalone-note">日程为本地示例，仅用于展示。真实课表暂未接入。</p>
            <button className="button button-secondary" onClick={() => navigate('home')}>
              <ArrowLeft size={15} />
              返回工作台
            </button>
          </section>
        )}
        {page === 'profile' && (
          <section className="standalone-page profile-page">
            <header className="standalone-title">
              <div>
                <span className="eyebrow">06 / MY SPACE</span>
                <h1 className="pixel-type">你的专属学习空间。</h1>
                <p>按自己的节奏，慢慢来。</p>
              </div>
              <span className="local-page-badge">本地示例</span>
            </header>
            <div className="profile-card">
              <span className="profile-avatar pixel-type">{name.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{name}</h2>
                <p>
                  {preview ? '工作台体验访客' : user.username} <span>·</span>{' '}
                  {academicSnapshot.semester}
                </p>
              </div>
              <span className="profile-status">
                <CheckCheck size={14} />
                学习者
              </span>
            </div>
            <Module number="01" title="PREFERENCES" subtitle="偏好与设置" label="PERSONAL">
              <div className="preference-row">
                <div>
                  <strong>学业提醒</strong>
                  <p>本次浏览时显示任务提醒，不会发送系统通知。</p>
                </div>
                <button
                  className={`toggle ${reminders ? 'on' : ''}`}
                  role="switch"
                  aria-label="学业提醒"
                  aria-checked={reminders}
                  onClick={() => setReminders(!reminders)}
                >
                  <span />
                </button>
              </div>
              <div className="preference-row">
                <div>
                  <strong>学期与平台设置</strong>
                  <p>
                    {preview
                      ? '登录后可连接你的学习平台并设置学期。'
                      : '查看或调整已保存在当前浏览器的学期设置。'}
                  </p>
                </div>
                <button className="text-button" onClick={onSettings}>
                  <Settings2 size={16} />
                  {preview ? '前往登录' : '查看设置'}
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </Module>
            {notice && <Notice tone="error">{notice}</Notice>}
            <button
              className="button button-secondary"
              onClick={() => {
                setNotice('')
                void onLogout().catch(() => setNotice('暂时无法退出，请重试。'))
              }}
            >
              <LogOut size={15} />
              {preview ? '退出本地预览' : '退出登录'}
            </button>
          </section>
        )}
      </main>
      <footer className="os-footer">
        <span>
          <span className="status-square" />
          {preview ? 'LOCAL PREVIEW' : 'STUDY WORKSPACE'} <span className="footer-dot">·</span>{' '}
          数据仅作展示
        </span>
        <span>
          DESIGNED FOR A LITTLE MORE CLARITY.<span className="footer-dot">✦</span>
          <span>ACADEMIC ASSISTANT © 2026</span>
        </span>
      </footer>
      {course && (
        <Modal title={`${course.name} / ${course.task}`} onClose={() => setCourse(undefined)}>
          <div className="course-detail">
            <span className={`course-code code-${course.color}`}>{course.code}</span>
            <span className="mono">{course.subtitle}</span>
            <h3>{course.task}</h3>
            <p>{course.detail}</p>
            <dl>
              <div>
                <dt>课程教师</dt>
                <dd>{course.teacher}</dd>
              </div>
              <div>
                <dt>学习进度</dt>
                <dd>{course.progress}%</dd>
              </div>
              <div>
                <dt>当前状态</dt>
                <dd>{course.status}</dd>
              </div>
              {course.due && (
                <div>
                  <dt>示例截止日期</dt>
                  <dd>
                    {academicSnapshot.date.slice(0, 4)}-{course.due}
                  </dd>
                </div>
              )}
            </dl>
            <p className="detail-note">本地示例数据 · 未连接真实课程</p>
            <button
              className="button button-primary"
              onClick={() => {
                setCourse(undefined)
                navigate('chat')
                send(`帮我安排${course.name}的${course.task}任务。`)
              }}
            >
              和助手一起安排
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
