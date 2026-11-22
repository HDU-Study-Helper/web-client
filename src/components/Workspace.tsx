import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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
  GripHorizontal,
  House,
  Layers3,
  LogOut,
  Eraser,
  Send,
  Settings2,
  Target,
  TrendingUp,
  UserRound,
  X,
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
import NotificationPreview from './NotificationPreview'
import LiveNotifications from './LiveNotifications'
import { LiveOfferingDetail, ScheduleDetail, TodoDetail } from './LiveDetails'
import { LiveCourses, LiveTimeLine, LiveToday, LiveTodos } from './LiveWorkspacePanels'
import { dateKey, schedulesOn, useWorkspaceData, type Offering, type PublicTodo, type ScheduleEntry } from '../useWorkspaceData'
import { useLiveChat } from '../useLiveChat'
import { loadDraft } from '../setup'
import { Brand, Modal, Notice, type ModalHandle } from './UI'

type Page = 'home' | 'schedule' | 'profile'
type Message = { id: number | string; role: 'user' | 'assistant'; text: string; sources?: string[] }
type ChatAnchor = { x: number; y: number }
type ChatMorph = {
  launcherWidth: number
  launcherHeight: number
  panelWidth: number
  panelHeight: number
}
type DragState = { pointerId: number; offsetX: number; offsetY: number }
type LauncherDragState = DragState & { startX: number; startY: number; moved: boolean }
const questionIcons = { calendar: CalendarDays, book: BookOpen, trend: TrendingUp, target: Target }
const liveQuestions = [
  { id: 'todos', icon: 'calendar', text: '有哪些未完成待办？', prompt: '请查看我的公开待办，只列出已记录的未完成事项。' },
  { id: 'explain', icon: 'book', text: '解释一个概念', prompt: '请用日常生活中的例子解释定积分，不要改动我的数据。' },
]
const navigation = [
  { id: 'home', label: '主页', icon: House },
  { id: 'schedule', label: '日程', icon: CalendarDays },
  { id: 'profile', label: '我的', icon: UserRound },
] as const

function Module({
  title,
  children,
  className = '',
  action,
}: {
  title: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`study-module ${className}`}>
      <header className="module-heading">
        <h2>
          <span className="module-subtitle">{title}</span>
        </h2>
        {action}
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
          <time dateTime={`${academicSnapshot.date}T${item.start}:00+08:00`}>
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
  const timelineFull = new URLSearchParams(window.location.search).get('show') === 'tlfull'
  const [page, setPage] = useState<Page>(() => timelineFull ? 'schedule' : 'home')
  const [pageAnnouncement, setPageAnnouncement] = useState('')
  const pageHeadingRefs = useRef<Partial<Record<Page, HTMLHeadingElement | null>>>({})
  const previousPage = useRef<Page>('home')
  const navigationVersion = useRef(0)
  const [clock, setClock] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [course, setCourse] = useState<MockCourse>()
  const [demoMessages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [demoReplying, setReplying] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [offering, setOffering] = useState<Offering>()
  const [selectedTodo, setSelectedTodo] = useState<PublicTodo>()
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleEntry>()
  const [choiceText, setChoiceText] = useState<Record<string, string>>({})
  const refreshWorkspace = useCallback(() => setRevision(n => n + 1), [])
  const today = dateKey(clock)
  const live = useWorkspaceData(!preview, today, revision)
  const chat = useLiveChat(user.id, !preview, chatOpen, refreshWorkspace)
  const messages: Message[] = preview ? demoMessages : chat.messages
  const replying = preview ? demoReplying : chat.busy
  const draft = loadDraft(user.id)
  const term = preview ? academicSnapshot.semester : draft.monday ? `${draft.academicYear} 学年 · 第 ${draft.term} 学期` : '学期未在本机设置'
  const metric = (value: number | undefined) => value === undefined ? '—' : String(value).padStart(2, '0')
  const [chatClosing, setChatClosing] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const [chatMorph, setChatMorph] = useState<ChatMorph>()
  const [snapping, setSnapping] = useState(false)
  const manualPanelPlacement = useRef(false)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function edgeAnchor(anchor: ChatAnchor, width: number, height: number): ChatAnchor {
    const next = { x: Math.min(Math.max(width + 12, anchor.x), window.innerWidth - 12), y: Math.min(Math.max(height + 12, anchor.y), window.innerHeight - 12) }
    if (window.matchMedia('(max-width: 760px)').matches) return next
    const distances = [next.x - width - 12, window.innerWidth - 12 - next.x, next.y - height - 12, window.innerHeight - 12 - next.y]
    const edge = distances.indexOf(Math.min(...distances))
    if (edge === 0) next.x = width + 12
    if (edge === 1) next.x = window.innerWidth - 12
    if (edge === 2) next.y = height + 12
    if (edge === 3) next.y = window.innerHeight - 12
    return next
  }
  function snapToEdge() {
    if (window.matchMedia('(max-width: 760px)').matches) return
    const launcher = chatLauncherRef.current
    if (!launcher) return
    clearTimeout(snapTimer.current)
    setSnapping(true)
    setChatAnchor(current => current ? edgeAnchor(current, launcher.offsetWidth, launcher.offsetHeight) : current)
    snapTimer.current = setTimeout(() => setSnapping(false), 280)
  }
  useEffect(() => () => clearTimeout(snapTimer.current), [])
  const [positionKey] = useState(() => `haa:assistant-position:v1:${user.id}:${window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop'}`)
  const [chatAnchor, setChatAnchor] = useState<ChatAnchor | undefined>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(positionKey) || 'null')
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y) || !Number.isFinite(saved.width) || !Number.isFinite(saved.height) || saved.width <= 0 || saved.height <= 0) return
      return { x: saved.x * window.innerWidth / saved.width, y: saved.y * window.innerHeight / saved.height }
    } catch { return undefined }
  })
  useEffect(() => {
    if (!chatAnchor) return
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(positionKey, JSON.stringify({ ...chatAnchor, width: window.innerWidth, height: window.innerHeight }))
      } catch { /* Storage may be disabled or full; dragging must remain usable. */ }
    }, 150)
    return () => window.clearTimeout(timer)
  }, [chatAnchor, positionKey])
  const [chatPlacement, setChatPlacement] = useState<{ right: number; bottom: number }>()
  const [notice, setNotice] = useState('')
  const [reminders, setReminders] = useState(true)
  const [selectedDay, setSelectedDay] = useState(0)
  const [chatSession, setChatSession] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const courseDescriptionId = useId()
  const clearDescriptionId = useId()
  const courseModalRef = useRef<ModalHandle>(null)
  const clearModalRef = useRef<ModalHandle>(null)
  const courseActionRef = useRef<HTMLButtonElement>(null)
  const keepChatRef = useRef<HTMLButtonElement>(null)
  const focusNewChat = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!confirmClear && focusNewChat.current) {
      focusNewChat.current = false
      inputRef.current?.focus()
    }
  }, [confirmClear])
  const conversationRef = useRef<HTMLDivElement>(null)
  const chatWindowRef = useRef<HTMLElement>(null)
  const chatLauncherRef = useRef<HTMLButtonElement>(null)
  const restoreChatFocus = useRef(false)
  const suppressLauncherClick = useRef(false)
  const dragState = useRef<DragState | undefined>(undefined)
  const launcherDragState = useRef<LauncherDragState | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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
  const greeting = hours < 12 ? '早上好' : hours < 18 ? '下午好' : '晚上好'
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
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
      clearTimeout(closeTimer.current)
      clearTimeout(replyTimer.current)
    }
  }, [])
  useEffect(() => {
    if (previousPage.current === page) return
    previousPage.current = page
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (page === 'home') document.getElementById('dashboard')?.scrollTo({ top: 0, behavior: 'instant' })
    pageHeadingRefs.current[page]?.focus({ preventScroll: true })
    setPageAnnouncement(`已切换到${navigation.find((item) => item.id === page)?.label}`)
  }, [page])
  useEffect(() => {
    const el = conversationRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, replying, chatOpen])
  useLayoutEffect(() => {
    if (!chatOpen) return
    const launcher = chatLauncherRef.current
    const panel = chatWindowRef.current
    if (!launcher || !panel) return
    const launcherRect = launcher.getBoundingClientRect()
    setChatMorph({
      launcherWidth: launcherRect.width,
      launcherHeight: launcherRect.height,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
    })
    const place = () => {
      if (window.matchMedia('(max-width: 760px)').matches) return
      if (manualPanelPlacement.current) {
        if (dragState.current) return
        setChatPlacement(current => current ? {
          right: Math.max(12, Math.min(current.right, window.innerWidth - panel.offsetWidth - 12)),
          bottom: Math.max(12, Math.min(current.bottom, window.innerHeight - panel.offsetHeight - 12)),
        } : current)
        return
      }
      const origin = chatLauncherRef.current!.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = Math.min(panel.offsetHeight, window.innerHeight - 24)
      // Keep the launcher in place. Prefer downward expansion when there is not enough room above.
      const verticalCenter = (origin.top + origin.bottom) / 2 - height / 2
      const onSide = origin.left <= 13 || origin.right >= window.innerWidth - 13
      const top = onSide
        ? Math.max(12, Math.min(verticalCenter, window.innerHeight - height - 12))
        : origin.bottom - height >= 12 ? origin.bottom - height : Math.min(origin.top, window.innerHeight - height - 12)
      const center = (origin.left + origin.right) / 2
      // Expand to both sides first; use the side with room only near an edge.
      const centered = center - width / 2
      const preferredLeft = centered >= 12 && centered + width <= window.innerWidth - 12
        ? centered
        : origin.left + width <= window.innerWidth - 12 ? origin.left : origin.right - width
      const left = Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12))
      const next = { right: window.innerWidth - left - width, bottom: window.innerHeight - Math.max(12, top) - height }
      setChatPlacement((current) => current?.right === next.right && current?.bottom === next.bottom ? current : next)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [chatOpen, chatAnchor, chatSession])
  useEffect(() => {
    const version = navigationVersion.current
    if (!chatOpen) {
      if (!restoreChatFocus.current) return
      restoreChatFocus.current = false
      const frame = requestAnimationFrame(() => {
        if (version === navigationVersion.current) chatLauncherRef.current?.focus()
      })
      return () => cancelAnimationFrame(frame)
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let revealTimer: ReturnType<typeof setTimeout> | undefined
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    if (reduceMotion) {
      setChatReady(true)
      inputRef.current?.focus({ preventScroll: true })
    } else {
      revealTimer = setTimeout(() => setChatReady(true), 520)
      focusTimer = setTimeout(() => {
        if (version === navigationVersion.current) inputRef.current?.focus({ preventScroll: true })
      }, 700)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeChat()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      clearTimeout(revealTimer)
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [chatOpen, chatSession])
  useEffect(() => {
    if (!chatOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (window.matchMedia('(max-width: 760px)').matches || document.querySelector('dialog[open]')) return
      const target = event.target
      if (!(target instanceof Node) || chatWindowRef.current?.contains(target)) return
      closeChat()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [chatOpen, chatClosing])
  useEffect(() => {
    if (!chatOpen) return
    const viewport = window.visualViewport
    const panel = chatWindowRef.current
    if (!viewport || !panel) return
    const updateVisualViewport = () => {
      panel.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
      panel.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`)
      if (document.activeElement === inputRef.current) {
        requestAnimationFrame(() => inputRef.current?.scrollIntoView({ block: 'nearest' }))
      }
    }
    updateVisualViewport()
    viewport.addEventListener('resize', updateVisualViewport)
    viewport.addEventListener('scroll', updateVisualViewport)
    return () => {
      viewport.removeEventListener('resize', updateVisualViewport)
      viewport.removeEventListener('scroll', updateVisualViewport)
    }
  }, [chatOpen])
  useEffect(() => {
    if (!chatAnchor) return
    const keepInViewport = () => {
      const launcher = chatLauncherRef.current
      const width = launcher?.offsetWidth || 64
      const height = launcher?.offsetHeight || 58
      setChatAnchor((current) => {
        if (!current) return current
        if (launcherDragState.current || dragState.current) return current
        const next = edgeAnchor(current, width, height)
        return next.x === current.x && next.y === current.y ? current : next
      })
    }
    keepInViewport()
    window.addEventListener('resize', keepInViewport)
    return () => window.removeEventListener('resize', keepInViewport)
  }, [chatOpen, chatAnchor])

  function navigate(next: Page) {
    if (next === page) return
    navigationVersion.current++
    restoreChatFocus.current = false
    setPage(next)
  }
  function openChat() {
    manualPanelPlacement.current = false
    setChatSession((value) => value + 1)
    clearTimeout(closeTimer.current)
    setChatClosing(false)
    setChatReady(false)
    setChatMorph(undefined)
    setChatPlacement(undefined)
    if (!chatAnchor) {
      const launcher = chatLauncherRef.current
      const rect = launcher?.getBoundingClientRect()
      if (rect) setChatAnchor({ x: rect.right, y: rect.bottom })
    }
    setChatOpen(true)
  }
  function closeChat() {
    if (chatClosing) return
    const launcher = chatLauncherRef.current
    const panel = chatWindowRef.current
    if (launcher && panel) {
      const launcherRect = launcher.getBoundingClientRect()
      setChatMorph({
        launcherWidth: launcherRect.width,
        launcherHeight: launcherRect.height,
        panelWidth: panel.offsetWidth,
        panelHeight: panel.offsetHeight,
      })
    }
    dragState.current = undefined
    restoreChatFocus.current = true
    setChatReady(false)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setChatOpen(false)
      return
    }
    setChatClosing(true)
    closeTimer.current = setTimeout(() => {
      setChatOpen(false)
      setChatClosing(false)
      setChatMorph(undefined)
    }, 440)
  }
  function startLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || chatOpen) return
    const launcher = chatLauncherRef.current
    if (!launcher) return
    clearTimeout(snapTimer.current)
    setSnapping(false)
    const rect = launcher.getBoundingClientRect()
    launcherDragState.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveLauncher(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDragState.current
    const launcher = chatLauncherRef.current
    if (!drag || drag.pointerId !== event.pointerId || !launcher) return
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
    if (moved) drag.moved = true
    const left = Math.min(
      Math.max(12, event.clientX - drag.offsetX),
      window.innerWidth - launcher.offsetWidth - 12,
    )
    const top = Math.min(
      Math.max(12, event.clientY - drag.offsetY),
      window.innerHeight - launcher.offsetHeight - 12,
    )
    setChatAnchor({ x: left + launcher.offsetWidth, y: top + launcher.offsetHeight })
  }
  function endLauncherDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = launcherDragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressLauncherClick.current = drag.moved
    if (drag.moved) setTimeout(() => (suppressLauncherClick.current = false), 0)
    launcherDragState.current = undefined
    if (drag.moved) snapToEdge()
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function activateLauncher() {
    if (suppressLauncherClick.current) {
      suppressLauncherClick.current = false
      return
    }
    openChat()
  }
  function startChatDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || window.matchMedia('(max-width: 760px)').matches) return
    const panel = chatWindowRef.current
    if (!panel) return
    clearTimeout(snapTimer.current)
    setSnapping(false)
    const rect = panel.getBoundingClientRect()
    dragState.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    manualPanelPlacement.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveChat(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragState.current
    const panel = chatWindowRef.current
    if (!drag || drag.pointerId !== event.pointerId || !panel) return
    const maxX = Math.max(12, window.innerWidth - panel.offsetWidth - 12)
    const maxY = Math.max(12, window.innerHeight - panel.offsetHeight - 12)
    const x = Math.min(Math.max(12, event.clientX - drag.offsetX), maxX)
    const y = Math.min(Math.max(12, event.clientY - drag.offsetY), maxY)
    setChatPlacement({ right: window.innerWidth - x - panel.offsetWidth, bottom: window.innerHeight - y - panel.offsetHeight })
  }
  function endChatDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return
    dragState.current = undefined
    const panel = chatWindowRef.current
    const launcher = chatLauncherRef.current
    if (panel && launcher) {
      const rect = panel.getBoundingClientRect()
      const target = edgeAnchor({ x: rect.right, y: rect.bottom }, panel.offsetWidth, panel.offsetHeight)
      clearTimeout(snapTimer.current)
      setSnapping(true)
      setChatPlacement({ right: window.innerWidth - target.x, bottom: window.innerHeight - target.y })
      // Both shapes share the same docking edge and center along that edge.
      // Re-running nearest-edge selection with launcher dimensions can choose a different edge.
      const panelLeft = target.x - panel.offsetWidth
      const panelTop = target.y - panel.offsetHeight
      const distances = [panelLeft - 12, window.innerWidth - 12 - target.x, panelTop - 12, window.innerHeight - 12 - target.y]
      const edge = distances.indexOf(Math.min(...distances))
      const ballWidth = launcher.offsetWidth
      const ballHeight = launcher.offsetHeight
      const anchor = {
        x: panelLeft + panel.offsetWidth / 2 + ballWidth / 2,
        y: panelTop + panel.offsetHeight / 2 + ballHeight / 2,
      }
      if (edge === 0) anchor.x = ballWidth + 12
      if (edge === 1) anchor.x = window.innerWidth - 12
      if (edge === 2) anchor.y = ballHeight + 12
      if (edge === 3) anchor.y = window.innerHeight - 12
      setChatAnchor({
        x: Math.min(Math.max(ballWidth + 12, anchor.x), window.innerWidth - 12),
        y: Math.min(Math.max(ballHeight + 12, anchor.y), window.innerHeight - 12),
      })
      snapTimer.current = setTimeout(() => setSnapping(false), 280)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function send(text: string) {
    const value = text.trim()
    if (!preview) {
      if (chat.send(value)) setInput('')
      return
    }
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
    if (!preview) {
      setConfirmClear(false)
      void chat.newThread().then(created => {
        if (created) {setInput('');setChoiceText({})}
      })
      return
    }
    clearTimeout(replyTimer.current)
    pendingReply.current = false
    setReplying(false)
    setMessages([])
    setInput('')
    focusNewChat.current = true
    setConfirmClear(false)
  }
  function requestNewChat() {
    if (!preview || messages.length || pendingReply.current) setConfirmClear(true)
    else inputRef.current?.focus()
  }

  return (
    <div className={`study-os ${page === 'home' ? 'is-home' : ''} ${timelineFull ? 'show-tlfull' : ''} ${snapping ? 'assistant-snapping' : ''}`}>
      <a className="skip-link" href="#workspace-content" onClick={(event) => {
        event.preventDefault()
        const content = document.getElementById('workspace-content')
        if (content) content.dataset.skipFocus = event.detail === 0 ? 'true' : 'false'
        content?.focus({ preventScroll: true })
        document.getElementById('workspace-content')?.scrollIntoView({ block: 'start' })
      }}>
        跳到主要内容
      </a>
      <header className="os-header">
        <button
          className="os-brand"
          onClick={() => navigate('home')}
          aria-label="Academic Assistant 主页"
        >
          <Brand small />
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
        </div>
      </header>

      <div className="workspace-meta">
        <strong>
          {preview ? <>本地示例快照 · <time dateTime={academicSnapshot.date}>{academicSnapshot.date}</time></> : '当前账号 · 学业工作台'}
        </strong>
        <span>
          {term}{preview && <> <span className="meta-divider">/</span> {academicSnapshot.week}</>}
        </span>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {pageAnnouncement}
      </p>
      <main id="workspace-content" tabIndex={-1} onPointerDown={() => { delete document.getElementById('workspace-content')?.dataset.skipFocus }} onBlur={(event) => { if (event.target === event.currentTarget) delete event.currentTarget.dataset.skipFocus }} className={`workspace-main ${page === 'home' ? '' : 'single-view'}`}>
        <div className="dashboard-scroll" id="dashboard" tabIndex={-1} hidden={page !== 'home'}>
          <section className="welcome-panel">
            <PixelComputer />
            <div className="welcome-copy">
              <h1
                ref={(heading) => {
                  pageHeadingRefs.current.home = heading
                }}
                className="pixel-type"
                tabIndex={-1}
              >
                {greeting}，{name}！<span className="cursor-block" />
              </h1>
              <div className="welcome-datetime">
                <span>当前日期 {date}</span>
                <span className="welcome-time-divider">·</span>
                <time dateTime={clock.toISOString()}>{time}</time>
                <span className="welcome-time-zone">北京时间</span>
              </div>
              <p>{preview ? `示例学业概览 · ${academicSnapshot.date} 快照，与当前时钟分开` : '数据来自当前账号已保存的日程、学业归档和公开待办。'}</p>
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
            title="学业总览"
            className="overview-module"
          >
            <div className="overview-grid">
              {[
                {
                  icon: ClipboardCheck,
                  value: preview ? academicSnapshot.pendingTasks : live.todos.data?.filter(t => t.status === 'open').length,
                  label: preview ? '示例待完成任务' : '未完成待办',
                  color: 'blue',
                },
                {
                  icon: CalendarDays,
                  value: preview ? academicSnapshot.scheduledClasses : live.schedules.data && schedulesOn(live.schedules.data, today).filter(t => t.source === 'TIMETABLE').length,
                  label: preview ? '示例日课程' : '今日课程',
                  color: 'sand',
                },
                { icon: Layers3, value: preview ? courses.length : live.offerings.data?.length, label: preview ? '示例进行中课程' : '平台开课实例', color: 'green' },
              ].map(({ icon: Icon, value, label, color }) => (
                <div className={`stat stat-${color}`} key={label}>
                  <span className="stat-icon">
                    <Icon size={29} strokeWidth={1.5} />
                  </span>
                  <div>
                    <strong>{metric(value)}</strong>
                    <span>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </Module>

          <div className="dashboard-middle">
            <Module
              title={preview ? "示例安排" : "今日安排"}
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
              {preview ? <><ScheduleList />
              <footer className="module-footnote">
                <Clock3 size={12} /> 示例日程 · {academicSnapshot.dateLabel}
              </footer></> : <LiveToday schedules={live.schedules} today={today} onSelect={setSelectedSchedule} />}
            </Module>
            <Module
              title={preview ? "示例学业简报" : "公开待办"}
              className="brief-module"
            >
              {preview ? <><div className="brief-card">
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
              {reminders && <p className="brief-hint">{brief.suggestion}</p>}</> : <LiveTodos resource={live.todos} onSelect={setSelectedTodo} brief reminders={reminders} />}
            </Module>
          </div>

          <Module
            title={preview ? "示例课程" : "平台课程归档"}
            className="courses-module"
          >
            {preview ? <><div className="course-table" role="group" aria-label="课程学习进度">
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
                  aria-describedby={`course-progress-${c.id} course-task-${c.id}`}
                >
                  <span className="course-name">
                    <span className={`course-code code-${c.color}`}>{c.code}</span>
                    <strong>{c.name}</strong>
                  </span>
                  <span className="progress-cell" id={`course-progress-${c.id}`}>
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
                  <span className="course-task" id={`course-task-${c.id}`}>
                    {c.due ? (
                      <>
                        <span className="task-dot">·</span>
                        <span className="course-task-name">{c.task}</span>
                        <small>
                          示例截止 <time dateTime={c.due}>{c.due}</time>
                        </small>
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
            </button></> : <LiveCourses resource={live.offerings} expanded={expanded} onExpand={() => setExpanded(!expanded)} onSelect={setOffering} />}
          </Module>
        </div>

        {chatOpen && chatMorph && (!chatReady || chatClosing) && (
          <span
            className={`chat-morph-shell ${chatClosing ? 'is-closing' : ''}`}
            aria-hidden="true"
            style={
              {
                '--morph-from-width': `${chatMorph.launcherWidth}px`,
                '--morph-from-height': `${chatMorph.launcherHeight}px`,
                '--morph-to-width': `${chatMorph.panelWidth}px`,
                '--morph-to-height': `${chatMorph.panelHeight}px`,
                '--morph-offset-x': `${chatAnchor && chatPlacement ? chatAnchor.x - (window.innerWidth - chatPlacement.right) : 0}px`,
                '--morph-offset-y': `${chatAnchor && chatPlacement ? chatAnchor.y - (window.innerHeight - chatPlacement.bottom) : 0}px`,
                right: chatPlacement?.right ?? (chatAnchor ? window.innerWidth - chatAnchor.x : undefined),
                bottom: chatPlacement?.bottom ?? (chatAnchor ? window.innerHeight - chatAnchor.y : undefined),
              } as CSSProperties
            }
          />
        )}
        {chatOpen && (
          <section
            ref={chatWindowRef}
            id="assistant-chat-window"
            className={`assistant-console chat-window ${chatReady ? 'is-ready' : ''} ${chatClosing ? 'is-closing' : ''}`}
            aria-label="Academic Assistant 对话区域"
            style={
              chatPlacement ?? (chatAnchor
                ? {
                    right: window.innerWidth - chatAnchor.x,
                    bottom: window.innerHeight - chatAnchor.y,
                  }
                : undefined)
            }
          >
          <header
            className="console-heading chat-window-handle"
            onPointerDown={startChatDrag}
            onPointerMove={moveChat}
            onPointerUp={endChatDrag}
            onPointerCancel={endChatDrag}
          >
            <GripHorizontal className="chat-drag-icon" size={18} aria-hidden="true" />
            <h2 className="pixel-type">
              Academic Assistant <span>学习助手</span>
            </h2>

            <button
              type="button"
              className="chat-close-button"
              aria-label="关闭学习助手"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={closeChat}
            >
              <X size={18} />
            </button>
          </header>
          <div className="conversation-scroll" ref={conversationRef}>
            <div className={`assistant-onboarding ${messages.length ? 'compact' : ''}`}>
              <div className="assistant-greeting">
                <PixelComputer happy />
                <div className="greeting-bubble">
                  <h3 className="pixel-type">{chatCopy.welcome}</h3>
                  <p>{preview ? academicSnapshot.assistantIntro : '可以查公开待办，或请课程助手核实具体事项。'}</p>
                </div>
              </div>
              <div className="suggested-area">
                <div className="suggested-heading">
                  <span className="question-mark">?</span>
                  <h3>不妨，从这里开始</h3>
                </div>
                <div className="suggested-grid">
                  {(preview ? suggestedQuestions : liveQuestions).map((q) => {
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
            {messages.length > 0 && (
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
                          <strong>Academic Assistant</strong>
                          <span className="local-label">{preview ? '本地演示' : '当前账号'}</span>
                        </>
                      ) : (
                        <>
                          <span className="user-message-avatar">
                            <UserRound size={13} />
                          </span>
                          <strong>{name}</strong>
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
            {!preview && chat.error && <Notice tone="error">{chat.error}</Notice>}
            {!preview && chat.questions.map(q => <fieldset key={q.id} className="live-question">
              <legend>待回答</legend><p className="live-body">{q.text}</p>
              {q.options.length ? <div className="modal-actions">{q.options.map(op => <button key={op.id} type="button" className="button button-secondary" disabled={replying} onClick={() => chat.send(op.label, q.id)}>{op.label}</button>)}</div> : <form onSubmit={event => {event.preventDefault();if(chat.send(choiceText[q.id] || '', q.id))setChoiceText(old=>({...old,[q.id]:''}))}}>
                <label>回答此问题<input value={choiceText[q.id] || ''} onChange={event => setChoiceText(old => ({...old,[q.id]:event.target.value}))} maxLength={2000} /></label>
                <button type="submit" className="button button-primary" disabled={replying || !choiceText[q.id]?.trim()}>提交回答</button>
              </form>}
            </fieldset>)}
          </div>
          <div className="console-bottom">
            <div className="console-tools">
              <span>
                  <span className="status-square" /> 学习模式{' '}
                  <span className="tool-divider">/</span> {preview ? "本地演示" : "真实会话"}
              </span>
              {!preview && <button type="button" onClick={() => void chat.refresh()}>刷新记录</button>}
              <button disabled={preview && !messages.length} onClick={requestNewChat}>
                <Eraser size={13} />
                {preview ? "清空并新建" : "新会话"}
              </button>
            </div>
            <form className="chat-composer" onSubmit={submit}>
              <label htmlFor="assistant-input" className="sr-only">
                向学习助手提问
              </label>
              <textarea
                ref={inputRef}
                id="assistant-input"
                rows={2}
                maxLength={2000}
                placeholder={preview ? chatCopy.placeholder : "想查什么，或需要课程助手帮你做什么？"}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  const mobile = window.matchMedia('(max-width: 760px)').matches
                  if (
                    !mobile &&
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
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
            <div className="composer-hint composer-hint-desktop">
              <span>{preview ? chatCopy.note : chat.questions.length ? '新消息会放弃本会话当前待答问题。' : '当前账号 · 助手可能操作你的学业信息'}</span>
              <span>
                <CornerDownLeft size={11} /> Enter 发送 <span className="tool-divider">·</span>{' '}
                Shift + Enter 换行
              </span>
            </div>
            <div className="composer-hint composer-hint-mobile">
              <span>{preview ? chatCopy.note : chat.questions.length ? '新消息会放弃本会话当前待答问题。' : '当前账号 · 助手可能操作你的学业信息'}</span>
              <span>点击发送按钮发送 · 回车换行</span>
            </div>
          </div>
        </section>
        )}

        {page === 'schedule' && (
          <section className="standalone-page schedule-page">
            <header className="standalone-title">
              <h1
                ref={(heading) => { pageHeadingRefs.current.schedule = heading }}
                className="pixel-type"
                tabIndex={-1}
              >日程</h1>
              <span className="local-page-badge">{preview ? `示例快照 · ${academicSnapshot.date}` : '当前账号'}</span>
            </header>
            <div className="schedule-composition">
            <div className="schedule-primary">
            {preview ? <><div className="schedule-dates">
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
            <Module title="示例时间线">
              {selectedDay === 0 ? (
                <ScheduleList detailed />
              ) : (
                <div className="schedule-empty">
                  <CalendarDays size={34} strokeWidth={1} />
                  <h2>这一天，还留有空白。</h2>
                  <p>当前示例没有安排，给自己留一点自由时间。</p>
                </div>
              )}
            </Module></> : <LiveTimeLine schedules={live.schedules} today={today} selected={selectedDay} onDay={setSelectedDay} onSelect={setSelectedSchedule} />}
            </div>
            <aside className="schedule-companion" aria-label="日程相关任务">
              <Module title="近期截止">
                {preview ? <><p className="companion-note">按 {academicSnapshot.date} 示例快照排序</p>
                {courses.filter((item) => item.due).sort((a, b) => a.due.localeCompare(b.due)).map((item) => (
                  <button className="companion-task" key={item.id} onClick={() => setCourse(item)}>
                    <time dateTime={item.due}>{item.due.slice(5).replace('-', '/')}</time>
                    <span><strong>{item.task}</strong><small>{item.name}</small></span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </button>
                ))}</> : <LiveTodos resource={live.todos} onSelect={setSelectedTodo} />}
              </Module>
              <div className="schedule-assistant-note">
                <PixelComputer happy />
                <div><strong>课后怎么安排？</strong><p>让助手结合课程任务，帮你梳理学习顺序。</p><button className="text-button" onClick={openChat}>和助手聊聊 <ArrowUpRight size={14} /></button></div>
              </div>
            </aside>
            <div className="schedule-notifications">{preview ? <NotificationPreview /> : <LiveNotifications revision={revision} onSettled={refreshWorkspace} />}</div>
            </div>
            <button
              className="button button-secondary standalone-action"
              onClick={() => navigate('home')}
            >
              <ArrowLeft size={15} />
              返回工作台
            </button>
          </section>
        )}
        {page === 'profile' && (
          <section className="standalone-page profile-page">
            <header className="standalone-title">
              <h1
                ref={(heading) => { pageHeadingRefs.current.profile = heading }}
                className="pixel-type"
                tabIndex={-1}
              >我的</h1>
              <span className="local-page-badge">{preview ? `示例快照 · ${academicSnapshot.date}` : '当前账号'}</span>
            </header>
            <div className="profile-composition">
            <div className="profile-identity-column">
            <div className="profile-card">
              <span className="profile-avatar">{name.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{name}</h2>
                <p>
                  {preview ? '工作台体验访客' : user.username} <span>·</span>{' '}
                  {term}
                </p>
              </div>
              <span className="profile-status">
                <CheckCheck size={14} />
                学习者
              </span>
            </div>
            <p className="profile-context">学期与作息保存在当前浏览器。平台连接请在设置中核对。</p>
            <div className="profile-assistant-note"><PixelComputer happy /><strong>学期有变化？</strong><p>调整课程与作息后，回到设置核对学期信息。</p><button className="text-button" onClick={onSettings}>查看学期设置 <ArrowUpRight size={14} /></button></div>
            </div>
            <div className="profile-settings-column">
            <Module title="偏好与设置">
              <div className="preference-row">
                <div>
                  <strong>学业提醒</strong>
                  <p>{preview ? "本次浏览时显示任务提醒，不会发送系统通知。" : "只控制首页待办提示，不影响通知或定时任务。"}</p>
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
            {preview ? <NotificationPreview /> : <LiveNotifications revision={revision} onSettled={refreshWorkspace} />}
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
            </div>
            </div>
          </section>
        )}
      </main>
      <button
        ref={chatLauncherRef}
        type="button"
        className={`assistant-launcher ${chatOpen ? 'is-transforming' : ''} ${chatClosing ? 'is-returning' : ''}`}
        aria-label={chatOpen ? '学习助手已打开' : '打开学习助手'}
        aria-expanded={chatOpen}
        aria-controls="assistant-chat-window"
        style={
          chatAnchor
            ? { right: window.innerWidth - chatAnchor.x, bottom: window.innerHeight - chatAnchor.y }
            : undefined
        }
        onPointerDown={startLauncherDrag}
        onPointerMove={moveLauncher}
        onPointerUp={endLauncherDrag}
        onPointerCancel={endLauncherDrag}
        onClick={activateLauncher}
        disabled={chatOpen}
      >
        <span className="assistant-launcher-icon" aria-hidden="true">
          <PixelComputer happy />
        </span>
        <span className="assistant-launcher-label">学习助手</span>
        {!!messages.length && <span className="assistant-launcher-count">{messages.length}</span>}
      </button>
      {confirmClear && (
        <Modal title={preview ? "清空并新建对话？" : "开启新会话？"} closeHandleRef={clearModalRef} onClose={() => setConfirmClear(false)} descriptionId={clearDescriptionId} initialFocusRef={keepChatRef}>
          <p id={clearDescriptionId} className="modal-description">{preview ? "当前消息将被清空，正在生成的回复也会停止。保留对话可继续查看现有消息。" : "会切到一段新会话，不删除原有聊天；原任务已提交的操作不会撤销。"}</p>
          <div className="modal-actions">
            <button ref={keepChatRef} type="button" className="button button-secondary" onClick={() => clearModalRef.current?.close()}>保留对话</button>
            <button type="button" className="button button-primary" onClick={() => clearModalRef.current?.close(clearChat)}>{preview ? "确认清空并新建" : "确认新会话"}</button>
          </div>
        </Modal>
      )}
      {offering && <LiveOfferingDetail offering={offering} onClose={() => setOffering(undefined)} />}
      {selectedTodo && <TodoDetail todo={selectedTodo} onClose={() => setSelectedTodo(undefined)} />}
      {selectedSchedule && <ScheduleDetail item={selectedSchedule} onClose={() => setSelectedSchedule(undefined)} />}
      {course && (
        <Modal title={`${course.name} / ${course.task}`} closeHandleRef={courseModalRef} onClose={() => setCourse(undefined)} descriptionId={courseDescriptionId} initialFocusRef={courseActionRef}>
          <div className="course-detail">
            <span className={`course-code code-${course.color}`}>{course.code}</span>
            <span>{course.subtitle}</span>
            <h3>{course.task}</h3>
            <p id={courseDescriptionId}>{course.detail}</p>
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
                    <time dateTime={course.due}>{course.due}</time>
                  </dd>
                </div>
              )}
            </dl>
            <p className="detail-note">{academicSnapshot.date} 示例快照 · 未连接真实课程</p>
            <button
              ref={courseActionRef}
              className="button button-primary"
              onClick={() => courseModalRef.current?.close(() => {
                setCourse(undefined)
                openChat()
                send(`帮我安排${course.name}的${course.task}任务。`)
              })}
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
