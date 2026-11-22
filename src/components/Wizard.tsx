import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  CloudDownload,
  ExternalLink,
  GraduationCap,
  Layers3,
  Link2,
  LockKeyhole,
  LogOut,
  MessageCircle,
  RefreshCw,
  School,
  ShieldCheck,
} from 'lucide-react'
import { activeConnection, api, connectionPath, dwsPath, errorMessage } from '../api'
import { loadDraft, saveDraft, schoolConnectionPreference, validatePeriodFields, validateTermFields, type ValidationError } from '../setup'
import type { Connection, Group, ImportResult, SetupDraft, Source, User } from '../types'
import AuthDialog from './AuthDialog'
import GroupDialog from './GroupDialog'
import TimetableEditor from './TimetableEditor'
import { Brand, Notice, Spinner } from './UI'

const steps = [
  { title: '连接学习平台', subtitle: '让分散的信息在这里相遇', icon: Link2 },
  { title: '连接杭电教务', subtitle: '接入你的课程与教学安排', icon: School },
  { title: '设置当前学期', subtitle: '为每一周找到正确的起点', icon: CalendarDays },
  { title: '设置每日作息', subtitle: '把节次变成清晰的时间表', icon: Clock3 },
]
const platforms = [
  {
    id: 'dws',
    name: '钉钉',
    subtitle: 'DINGTALK',
    description: '连接课程群、班级群，让重要通知不再遗漏。',
    color: 'dingtalk',
    mark: 'D',
    tag: '课程消息',
    icon: MessageCircle,
  },
  {
    id: 'chaoxing',
    name: '学习通',
    subtitle: 'CHAOXING',
    description: '汇集课程、作业、考试与学习资料。',
    color: 'chaoxing',
    mark: '学',
    tag: '课程与作业',
    icon: BookOpen,
  },
  {
    id: 'mooc',
    name: '中国大学 MOOC',
    subtitle: 'ICOURSE163',
    description: '关注在线课程、测验和作业的最新安排。',
    color: 'mooc',
    mark: 'M',
    tag: '在线课程',
    icon: Layers3,
  },
  {
    id: 'ucampus',
    name: 'U 校园',
    subtitle: 'U CAMPUS',
    description: '把英语课程与学习任务，一起纳入视野。',
    color: 'ucampus',
    mark: 'U',
    tag: '语言学习',
    icon: GraduationCap,
  },
]
const stateNames: Record<string, string> = {
  pending: '待授权',
  scanned: '已扫码',
  expired: '授权已过期',
  error: '连接异常',
  disabled: '已断开',
}

export default function Wizard({
  user,
  onLogout,
  onComplete,
}: {
  user: User
  onLogout: () => Promise<void>
  onComplete: () => void
}) {
  const [draft, setDraft] = useState<SetupDraft>(() => loadDraft(user.id))
  const [sources, setSources] = useState<Source[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [dwsConnections, setDwsConnections] = useState<Connection[]>([])
  const [groups, setGroups] = useState<Group[]>()
  const [groupWritePending, setGroupWritePending] = useState(false)
  const [groupRevision, setGroupRevision] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([])
  const periodsValidated = useRef(false)
  const pendingFocus = useRef<string | undefined>(undefined)
  function focusField(field: string) {
    const target = document.getElementById(field)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }
  function showValidation(next: ValidationError[]) {
    if (draft.step === 3 || next.some((item) => item.field.startsWith('period-'))) periodsValidated.current = true
    setFieldErrors(next)
    if (next.length) {
      pendingFocus.current = next[0].field
      if (['academicYear', 'term', 'monday'].includes(next[0].field) && draft.step !== 2)
        setDraft((current) => ({ ...current, step: 2 }))
    }
  }
  const fieldProps = (field: string) => ({
    id: field,
    'aria-invalid': fieldErrors.some((item) => item.field === field) || undefined,
    'aria-describedby': fieldErrors.some((item) => item.field === field) ? `${field}-error` : undefined,
  })
  const fieldMessage = (field: string) => {
    const invalid = fieldErrors.find((item) => item.field === field)
    return invalid ? <span className="field-error" id={`${field}-error`}>{invalid.message}</span> : null
  }
  const [success, setSuccess] = useState('')
  const [storageFailed, setStorageFailed] = useState(false)
  const [auth, setAuth] = useState<string>()
  const [groupDialog, setGroupDialog] = useState(false)
  const [help, setHelp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const alive = useRef(true)
  const request = useRef(0)
  const content = useRef<HTMLDivElement>(null)
  const [preferredSchool, setPreferredSchool] = useState(() => schoolConnectionPreference(user.id))
  const schoolConnections = connections.filter(c => c.source === 'jwxt' && c.enabled && c.state === 'active')
  const school = schoolConnections.find(c => c.id === preferredSchool) ?? schoolConnections.sort((a, b) =>
    Number(Boolean(a.error_code)) - Number(Boolean(b.error_code)) ||
    (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0),
  )[0]
  const dws = activeConnection(dwsConnections)
  const connected = platforms.filter((platform) =>
    platform.id === 'dws' ? !!dws : !!activeConnection(connections, platform.id),
  )

  const refresh = useCallback(async () => {
    const version = ++request.current
    setLoading(true)
    const results = await Promise.allSettled([
      api<{ items: Source[] }>('/platforms/sources'),
      api<{ items: Connection[] }>('/platforms/connections'),
      api<{ items: Connection[] }>('/dws/connections'),
    ])
    if (!alive.current || version !== request.current) return
    const nextErrors: Record<string, string> = {}
    const [source, platform, ding] = results
    if (source.status === 'fulfilled') setSources(source.value.items || [])
    else nextErrors.sources = errorMessage(source.reason)
    if (platform.status === 'fulfilled')
      setConnections((platform.value.items || []).filter((c) => c.user_id === user.id))
    else nextErrors.platforms = errorMessage(platform.reason)
    if (ding.status === 'fulfilled')
      setDwsConnections((ding.value.items || []).filter((c) => c.user_id === user.id))
    else nextErrors.dws = errorMessage(ding.reason)
    setErrors(nextErrors)
    setLoading(false)
  }, [user.id])
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
      request.current++
    }
  }, [refresh])
  useEffect(() => {
    setStorageFailed(!saveDraft(user.id, draft))
  }, [user.id, draft])
  useEffect(() => {
    const controller = new AbortController()
    setGroups(undefined)
    if (dws && !groupWritePending)
      void api<{ items: Group[] }>(`${dwsPath(dws.id)}/groups`, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setGroups(data.items || [])
        })
        .catch(() => {
          /* The group picker exposes errors and can retry without changing the allowlist. */
        })
    return () => controller.abort()
  }, [dws?.id, success, groupWritePending, groupRevision])
  useEffect(() => {
    content.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    setError('')
    setSuccess('')
  }, [draft.step, draft.completed])

  useEffect(() => {
    if (pendingFocus.current) {
      focusField(pendingFocus.current)
      pendingFocus.current = undefined
    }
  }, [fieldErrors, draft.step])

  function update(patch: Partial<SetupDraft>) {
    const next = { ...draft, ...patch }
    // Recheck only errors already exposed by submission, never untouched fields.
    const remaining = [...validateTermFields(next), ...validatePeriodFields(next.periods)]
    setFieldErrors((current) => remaining.filter((item) => (periodsValidated.current && item.field.startsWith('period-')) || current.some((old) => old.field === item.field)))
    setDraft((current) => ({ ...current, ...patch, completed: false, importResult: undefined }))
    setError('')
    setSuccess('')
  }
  function navigate(step: number) {
    setDraft((current) => ({ ...current, step, completed: false }))
  }
  async function schoolLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget,
      values = new FormData(form)
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const connection = await api<Connection>('/platforms/jwxt/login', {
        method: 'POST',
        body: {
          username: String(values.get('schoolUsername')).trim(),
          password: values.get('schoolPassword'),
        },
      })
      if (!alive.current) return
      schoolConnectionPreference(user.id, connection.id)
      setPreferredSchool(connection.id)
      form.reset()
      await refresh()
      setSuccess('教务已连接，可以继续设置学期。')
    } catch (error) {
      if (alive.current) setError(errorMessage(error))
    } finally {
      const password = form.elements.namedItem('schoolPassword') as HTMLInputElement | null
      if (password) password.value = ''
      if (alive.current) setBusy(false)
    }
  }
  async function finish() {
    if (busy) return
    const invalid = [...validateTermFields(draft), ...validatePeriodFields(draft.periods)]
    showValidation(invalid)
    if (invalid.length) return
    setBusy(true)
    setError('')
    try {
      let result: ImportResult | undefined
      if (school) {
        result = await api<ImportResult>(`${connectionPath(school.id)}/sync`, {
          method: 'POST',
          body: {
            resource: 'schedule',
            academic_year: draft.academicYear,
            term: draft.term,
            calendar: { week_one_monday: draft.monday, periods: draft.periods },
          },
        })
      }
      if (alive.current)
        setDraft((current) => ({ ...current, completed: true, importResult: result }))
    } catch (error) {
      if (alive.current) setError(errorMessage(error))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  async function logout() {
    setBusy(true)
    setError('')
    try {
      await onLogout()
    } catch (error) {
      if (alive.current) {
        setError(errorMessage(error))
        setBusy(false)
      }
    }
  }
  function forward() {
    if (draft.step === 2) {
      const invalid = validateTermFields(draft)
      showValidation(invalid)
      if (invalid.length) return
    }
    navigate(draft.step + 1)
  }
  const schoolAvailable = sources.some(
    (source) => source.source === 'jwxt' && source.password_login,
  )
  const status = (id: string) => {
    const connection =
      id === 'dws'
        ? dwsConnections.find((c) => c.enabled)
        : connections.find((c) => c.source === id && c.enabled)
    return connection ? stateNames[connection.state] || '未连接' : '未连接'
  }
  return (
    <div className="setup-page">
      <header className="setup-header">
        <Brand small />
        <span className="header-divider" />
        <span className="header-section">初始设置</span>
        <div className="header-right">
          {user.role === 'admin' && (
            <a
              className="quiet-link admin-link"
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
            >
              管理后台 <ExternalLink size={13} />
            </a>
          )}
          {!draft.completed && <button type="button" className="text-button" onClick={onComplete} disabled={busy}>打开工作台</button>}
          <button className="text-button help-button" onClick={() => setHelp(!help)}>
            需要帮助 <ArrowUpRight size={14} />
          </button>
          <span className="account-avatar">
            {(user.display_name || user.username).slice(0, 1).toUpperCase()}
          </span>
          <span className="account-name">{user.display_name || user.username}</span>
          <button
            className="icon-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => void logout()}
            disabled={busy}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <h1>
            让学习助手
            <br />
            更懂你的学期<span>。</span>
          </h1>
          <p className="sidebar-intro">
            花几分钟，连接你的校园生活。
            <br />
            之后的每一步，都更有条理。
          </p>
          <nav className="step-navigation" aria-label="初始设置步骤">
            {steps.map((step, index) => (
              <button
                key={step.title}
                className={`step-nav ${draft.completed || draft.step > index ? 'done' : ''} ${!draft.completed && draft.step === index ? 'current' : ''}`}
                disabled={busy || (!draft.completed && index > draft.step)}
                aria-current={!draft.completed && draft.step === index ? 'step' : undefined}
                onClick={() => navigate(index)}
              >
                <span className="step-number">
                  {draft.completed || draft.step > index ? (
                    <Check size={16} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <span>{step.subtitle}</span>
                </span>
                {!draft.completed && draft.step === index && <span className="current-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <ShieldCheck size={21} />
            <strong>由你连接，由你掌握</strong>
            <p>
              只读取你授权的账号与群。
              <br />
              可以随时回到设置调整连接。
            </p>
          </div>
        </aside>
        <main className="setup-main">
          <div className="setup-content" ref={content} tabIndex={-1}>
            {storageFailed && (
              <Notice tone="error">
                当前浏览器无法保存设置，关闭页面后草稿可能丢失。平台连接和已导入的课表不受影响。
              </Notice>
            )}
            {help && (
              <Notice onClose={() => setHelp(false)}>
                学习平台使用各自官方 App
                扫码；教务使用杭电统一身份认证账号。学期首日和节次作息请以学校校历为准。遇到账号问题请联系管理员。
              </Notice>
            )}
            {draft.completed ? (
              <div className="completion">
                <div className="completion-art">
                  <span />
                  <CircleCheck size={46} strokeWidth={1.6} />
                  <span />
                </div>
                <h2>
                  {draft.importResult ? '时间表就绪，新学期见。' : '设置已保存，随时可以出发。'}
                </h2>
                <p className="completion-intro">
                  {draft.importResult
                    ? '课程安排已经汇入 HAA，让每一天都有清晰的开始。'
                    : '学期与作息已保存在当前浏览器，连接教务后即可导入课表。'}
                </p>
                <div className="completion-summary">
                  <div>
                    <span className="summary-icon">
                      <CalendarDays size={20} />
                    </span>
                    <div>
                      <span>当前学期</span>
                      <strong>
                        {draft.academicYear}–{draft.academicYear + 1} 学年 · 第
                        {draft.term === 1 ? '一' : '二'}学期
                      </strong>
                    </div>
                    <Check size={18} />
                  </div>
                  <div>
                    <span className="summary-icon">
                      <Link2 size={20} />
                    </span>
                    <div>
                      <span>学习平台</span>
                      <strong>
                        {connected.length
                          ? connected.map((platform) => platform.name).join('、')
                          : '尚未绑定，可稍后连接'}
                      </strong>
                    </div>
                    <span className="summary-count">{connected.length} / 4</span>
                  </div>
                  <div>
                    <span className="summary-icon">
                      <School size={20} />
                    </span>
                    <div>
                      <span>杭电教务</span>
                      <strong>
                        {loading
                          ? '正在核对连接…'
                          : errors.platforms
                            ? '暂时无法读取连接状态'
                            : school
                              ? '已连接'
                              : '稍后连接'}
                      </strong>
                    </div>
                    {school && <Check size={18} />}
                  </div>
                  <div>
                    <span className="summary-icon">
                      <Clock3 size={20} />
                    </span>
                    <div>
                      <span>每日作息</span>
                      <strong>
                        {draft.periods.length} 节课 · {draft.periods[0]?.start} 至{' '}
                        {draft.periods.at(-1)?.end}
                      </strong>
                    </div>
                    <Check size={18} />
                  </div>
                </div>
                {draft.importResult && (
                  <Notice tone="success">
                    已导入 {draft.importResult.records} 条课表记录，生成{' '}
                    {draft.importResult.generated} 次课程安排。
                    {draft.importResult.skipped_practice > 0 &&
                      `另有 ${draft.importResult.skipped_practice} 条实践安排没有具体时间，已保留原文。`}
                  </Notice>
                )}
                {!!draft.importResult?.retired_modifications?.length && (
                  <Notice>
                    本次更新有 {draft.importResult.retired_modifications.length}{' '}
                    条曾修改的旧安排失效，请在日程中核对修改历史。
                  </Notice>
                )}
                <button className="button button-primary" onClick={onComplete}>
                  进入学业工作台 <ArrowRight size={17} />
                </button>
                <button className="button button-secondary" onClick={() => navigate(0)}>
                  查看与调整设置 <ArrowRight size={17} />
                </button>
                <p className="completion-footnote">
                  学期与作息设置保存在当前浏览器；平台连接和已导入课表保存在账号下。
                </p>
              </div>
            ) : (
              <>
                <div className="step-topline">
                  <span className="step-progress">
                    <strong>0{draft.step + 1}</strong> / 04
                  </span>
                </div>
                <div className="mobile-progress" aria-hidden="true">
                  {steps.map((_, i) => (
                    <span key={i} className={i <= draft.step ? 'filled' : ''} />
                  ))}
                </div>
                <div className="step-title">
                  <span className="step-title-icon">
                    {(() => {
                      const Icon = steps[draft.step].icon
                      return <Icon size={23} />
                    })()}
                  </span>
                  <h2>
                    {
                      [
                        '把学习平台，连在一起。',
                        '让课程表，找到归处。',
                        '新学期，从哪一周开始？',
                        '按你的节奏，排好每一天。',
                      ][draft.step]
                    }
                  </h2>
                  <p>
                    {
                      [
                        '连接你常用的平台，课程、作业和通知将在这里汇合。',
                        '使用杭电统一身份认证，接入你的学期课程与课表。',
                        '选择学年、学期与第一教学周，我们会据此展开课程安排。',
                        '设置学校的实际节次时间，确认后即可导入教务课表。',
                      ][draft.step]
                    }
                  </p>
                </div>
                {fieldErrors.length > 0 && (
                  <div className="notice notice-error" role="alert" aria-label="请检查以下字段">
                    <strong>请修正以下问题后继续：</strong>
                    <ul>
                      {fieldErrors.map((item) => (
                        <li key={item.field}>
                          <a href={`#${item.field}`} onClick={(event) => {
                            event.preventDefault()
                            const step = ['academicYear', 'term', 'monday'].includes(item.field) ? 2 : 3
                            if (draft.step !== step) {
                              pendingFocus.current = item.field
                              navigate(step)
                            } else focusField(item.field)
                          }}>{item.message}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.step === 0 && (
                  <>
                    <div className="section-line">
                      <span>
                        <span className="blue-dot" />
                        学习平台
                      </span>
                      <span>{loading ? '正在核对连接…' : `已连接 ${connected.length} / 4`}</span>
                      <button
                        className="text-button"
                        onClick={() => void refresh()}
                        disabled={loading}
                      >
                        <RefreshCw size={13} className={loading ? 'spinner' : ''} />
                        刷新
                      </button>
                    </div>
                    {Object.keys(errors).length > 0 && (
                      <Notice tone="error">
                        {Object.entries(errors).map(([key, value]) => (
                          <div key={key}>
                            {key === 'dws' ? '钉钉' : '学习平台'}：{value}
                          </div>
                        ))}
                        <button
                          className="text-button"
                          disabled={loading}
                          onClick={() => void refresh()}
                        >
                          重新读取连接
                        </button>
                      </Notice>
                    )}
                    <div className="platform-grid">
                      {platforms.map((platform) => {
                        const isDws = platform.id === 'dws',
                          connection = isDws ? dws : activeConnection(connections, platform.id)
                        const unavailable = isDws
                          ? !!errors.dws
                          : !!errors.sources ||
                            !!errors.platforms ||
                            !sources.some((s) => s.source === platform.id && s.qr_login)
                        return (
                          <article
                            key={platform.id}
                            className={`platform-card ${connection ? 'is-connected' : ''}`}
                          >
                            <div className="platform-card-top">
                              <span className={`platform-logo ${platform.color}`}>
                                {platform.mark}
                              </span>
                              <h3>{platform.name}</h3>
                              <span className={`connection-pill ${connection ? 'connected' : ''}`}>
                                {connection ? (
                                  <>
                                    <span />
                                    已连接
                                  </>
                                ) : unavailable ? (
                                  '暂不可用'
                                ) : (
                                  status(platform.id)
                                )}
                              </span>
                            </div>
                            <p>{platform.description}</p>
                            <div className="platform-card-action">
                              {connection ? (
                                <>
                                  {isDws ? (
                                    <button
                                      className="text-button"
                                      onClick={() => setGroupDialog(true)}
                                      disabled={loading}
                                    >
                                      选择群 <ChevronRight size={14} />
                                    </button>
                                  ) : (
                                    <button
                                      className="text-button"
                                      onClick={() => setAuth(platform.id)}
                                      disabled={loading}
                                    >
                                      重新授权 <RefreshCw size={13} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button
                                  className="text-button connect-button"
                                  disabled={loading || unavailable}
                                  onClick={() => setAuth(platform.id)}
                                >
                                  连接{platform.name === '中国大学 MOOC' ? ' MOOC' : platform.name}{' '}
                                  <ArrowUpRight size={16} />
                                </button>
                              )}
                            </div>
                            {isDws && connection && (
                              <p className="group-caption">
                                {groupWritePending ? '采集范围核对中，请稍候…' : groups === undefined
                                  ? '请打开群设置，检查采集范围'
                                  : groups.length
                                    ? `已选择 ${groups.length} 个采集群`
                                    : '尚未选择采集群，暂不读取群消息'}
                              </p>
                            )}
                          </article>
                        )
                      })}
                    </div>
                    <div className="gentle-note">
                      <ShieldCheck size={16} />
                      <p>只需连接你正在使用的平台。现在跳过也没关系，之后可以随时补充。</p>
                    </div>
                  </>
                )}
                {draft.step === 1 && (
                  <div className="school-step">
                    <div className="school-identity">
                      <span className="school-symbol">
                        <School size={29} strokeWidth={1.5} />
                      </span>
                      <div>
                        <strong>杭州电子科技大学</strong>
                      </div>
                      <span className="school-badge">统一身份认证</span>
                    </div>
                    {errors.platforms || errors.sources ? (
                      <Notice tone="error">
                        无法读取教务连接状态，请刷新后重试。
                        <button
                          className="text-button"
                          onClick={() => void refresh()}
                          disabled={loading}
                        >
                          重新读取
                        </button>
                      </Notice>
                    ) : school ? (
                      <div className="school-connected">
                        <span>
                          <Check size={24} />
                        </span>
                        <h3>教务已连接</h3>
                        <p>可以继续设置学期与作息，导入你的课表。</p>
                        <button
                          className="text-button"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? '收起登录表单' : '需要重新登录？'}
                        </button>
                      </div>
                    ) : null}
                    {(!school || showPassword) && (
                      <form className="school-form" onSubmit={schoolLogin}>
                        <fieldset
                          disabled={
                            busy ||
                            loading ||
                            !schoolAvailable ||
                            !!errors.sources ||
                            !!errors.platforms
                          }
                        >
                          <label htmlFor="schoolUsername">学号 / 统一认证账号</label>
                          <input
                            id="schoolUsername"
                            name="schoolUsername"
                            placeholder="请输入学号"
                            autoComplete="off"
                            maxLength={128}
                            required
                          />
                          <label htmlFor="schoolPassword">统一认证密码</label>
                          <input
                            id="schoolPassword"
                            name="schoolPassword"
                            placeholder="请输入统一认证密码"
                            type="password"
                            autoComplete="off"
                            maxLength={1024}
                            required
                          />
                          <button className="button button-primary full-width" type="submit">
                            {busy ? (
                              <>
                                <Spinner />
                                正在连接教务
                              </>
                            ) : (
                              <>
                                <Link2 size={17} />
                                连接教务处
                              </>
                            )}
                          </button>
                        </fieldset>
                      </form>
                    )}
                    {!loading && !schoolAvailable && !errors.sources && (
                      <Notice>当前服务尚未开放教务连接，请联系管理员或稍后设置。</Notice>
                    )}
                    <div className="school-notes">
                      <div>
                        <LockKeyhole size={17} />
                        <p>
                          <strong>密码只用于本次登录</strong>
                          <span>登录后加密保存会话，不保存教务密码。</span>
                        </p>
                      </div>
                      <div>
                        <CloudDownload size={17} />
                        <p>
                          <strong>课表由你手动导入</strong>
                          <span>完成学期与作息设置后，再获取课程安排。</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {draft.step === 2 && (
                  <div className="term-step">
                    <div className="form-section-title">
                      <CalendarDays size={18} />
                      当前学期
                    </div>
                    <div className="term-fields">
                      <label>
                        学年
                        <select
                          {...fieldProps('academicYear')}
                          value={draft.academicYear}
                          disabled={busy}
                          onChange={(event) => update({ academicYear: Number(event.target.value) })}
                        >
                          {[
                            ...new Set([
                              draft.academicYear,
                              ...Array.from(
                                { length: 9 },
                                (_, i) => new Date().getFullYear() - 4 + i,
                              ),
                            ]),
                          ]
                            .sort((a, b) => a - b)
                            .map((year) => (
                              <option key={year} value={year}>
                                {year}–{year + 1} 学年
                              </option>
                            ))}
                        </select>
                        {fieldMessage('academicYear')}
                      </label>
                      <label>
                        学期
                        <select
                          {...fieldProps('term')}
                          value={draft.term}
                          disabled={busy}
                          onChange={(event) => update({ term: Number(event.target.value) })}
                        >
                          <option value={1}>第一学期 · 秋季</option>
                          <option value={2}>第二学期 · 春季</option>
                        </select>
                        {fieldMessage('term')}
                      </label>
                    </div>
                    <div className="form-section-title term-date-title">
                      <span className="small-number">01</span>第一教学周
                    </div>
                    <label className="monday-label">
                      第一教学周的周一
                      <input
                        {...fieldProps('monday')}
                        type="date"
                        value={draft.monday}
                        min={`${draft.academicYear}-01-01`}
                        max={`${draft.academicYear + 1}-12-31`}
                        onChange={(event) => update({ monday: event.target.value })}
                      />
                      {fieldMessage('monday')}
                    </label>
                    <p className="field-hint">
                      请以学校公布的校历为准，不一定是报到或第一天上课的日期。
                    </p>
                    <div className="calendar-explainer">
                      <CalendarDays size={22} />
                      <div>
                        <strong>找到学期的第一格</strong>
                        <p>
                          例如第一教学周从周一开始，即使你的第一节课在周二，也应填写这一周的周一。
                        </p>
                        <div className="mini-week">
                          {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
                            <span key={day} className={i === 0 ? 'week-highlight' : ''}>
                              {day}
                              <i>{i === 0 ? <Check size={13} /> : '·'}</i>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {draft.step === 3 && (
                  <>
                    <div className="semester-strip">
                      <CalendarDays size={17} />
                      <span>
                        {draft.academicYear}–{draft.academicYear + 1} 学年 · 第
                        {draft.term === 1 ? '一' : '二'}学期
                      </span>
                      <button className="text-button" disabled={busy} onClick={() => navigate(2)}>
                        修改
                      </button>
                    </div>
                    <TimetableEditor
                      periods={draft.periods}
                      errors={fieldErrors}
                      onChange={(periods) => update({ periods })}
                      disabled={busy}
                    />
                    {!loading && !school && !errors.platforms && (
                      <Notice>
                        你还没有连接教务。可以先保存作息，之后连接教务再导入课表。
                        <button className="text-button" onClick={() => navigate(1)} disabled={busy}>
                          去连接教务
                        </button>
                      </Notice>
                    )}
                    {errors.platforms && (
                      <Notice tone="error">
                        无法读取教务连接状态，请先刷新，避免遗漏课表导入。
                        <button
                          className="text-button"
                          disabled={loading || busy}
                          onClick={() => void refresh()}
                        >
                          重新读取
                        </button>
                      </Notice>
                    )}
                  </>
                )}
                {success && (
                  <Notice tone="success" onClose={() => setSuccess('')}>
                    {success}
                  </Notice>
                )}
                {error && <Notice tone="error">{error}</Notice>}
                {draft.step === 3 && <p className="optional-label">暂不导入也可以进入工作台查看已有课表；设置和草稿会保留。</p>}
                <div className="wizard-footer">
                  <div>
                    {draft.step > 0 && (
                      <button
                        className="button button-quiet"
                        onClick={() => navigate(draft.step - 1)}
                        disabled={busy}
                      >
                        <ArrowLeft size={16} />
                        上一步
                      </button>
                    )}
                  </div>
                  <div className="wizard-next">
                    {draft.step < 2 && (
                      <span className="optional-label">
                        {draft.step === 0
                          ? '平台可按需连接'
                          : school
                            ? '连接已就绪'
                            : '也可以稍后连接'}
                      </span>
                    )}
                    {draft.step < 3 ? (
                      <button
                        className="button button-primary"
                        onClick={forward}
                        disabled={busy || loading}
                      >
                        {draft.step === 1 && !school ? '稍后连接，继续' : '下一步'}
                        <ArrowRight size={17} />
                      </button>
                    ) : (
                      <>
                      <button type="button" className="button button-secondary" onClick={onComplete} disabled={busy}>
                        暂不导入，进入工作台
                      </button>
                      <button
                        className="button button-primary"
                        onClick={() => void finish()}
                        disabled={busy || loading || !!errors.platforms}
                      >
                        {busy ? (
                          <>
                            <Spinner />
                            正在导入课表…
                          </>
                        ) : school ? (
                          <>
                            <CloudDownload size={17} />
                            完成设置并导入课表
                          </>
                        ) : (
                          <>
                            <Check size={17} />
                            保存并完成设置
                          </>
                        )}
                      </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="save-note">
                  <span className="small-status-dot" />
                  {storageFailed ? '草稿暂未保存' : '草稿自动保存在当前浏览器'}
                </div>
              </>
            )}
          </div>

        </main>
      </div>
      {auth && (
        <AuthDialog
          source={auth}
          name={platforms.find((platform) => platform.id === auth)?.name || auth}
          existing={auth === 'dws' ? dwsConnections.find((c) => c.enabled) : undefined}
          onClose={() => {
            setAuth(undefined)
            void refresh()
          }}
          onConnected={() => {
            setAuth(undefined)
            setSuccess('平台授权成功。')
            void refresh()
          }}
        />
      )}
      {groupDialog && dws && (
        <GroupDialog
          connection={dws.id}
          onClose={(pending) => {
            setGroupDialog(false)
            setGroupWritePending(pending)
            setGroups(undefined)
            if (!pending) setGroupRevision((value) => value + 1)
          }}
          onReconcile={() => {
            if (!alive.current) return
            setGroupWritePending(false)
            setGroupRevision((value) => value + 1)
          }}
          onSaved={() => {
            setGroupDialog(false)
            setSuccess('钉钉采集群已保存。')
            void refresh()
          }}
        />
      )}
    </div>
  )
}
