import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import PixelComputer from './PixelComputer'
import { api, errorMessage } from '../api'
import type { User } from '../types'
import { Brand, Notice, Spinner } from './UI'

export default function Login({
  onLogin,
  message,
  onPreview,
}: {
  onLogin: (user: User) => void
  message?: string
  onPreview: () => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget,
      values = new FormData(form)
    setError('')
    setBusy(true)
    try {
      const user = await api<User>('/auth/login', {
        method: 'POST',
        body: { username: String(values.get('username')).trim(), password: values.get('password') },
        sessionCheck: false,
      })
      form.reset()
      onLogin(user)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="login-page">
      <section className="login-story" aria-label="Academic Assistant 学业助手介绍">
        <Brand />
        <div className="story-copy">
          <h1>
            让学习，
            <br />
            回到自己的<span className="blue-text">节奏。</span>
          </h1>
          <p>
            课程、任务，还有突然闪过的好想法。
            <br />
            在这个小小的工作站里，都有自己的位置。
          </p>
        </div>
        <div className="retro-login-art" aria-hidden="true">
          <PixelComputer happy />
        </div>
      </section>
      <section className="login-main">
        <div className="login-top">
          <button className="text-button" onClick={() => setHelp(!help)} type="button">
            需要帮助 <ArrowRight size={14} />
          </button>
        </div>
        <div className="login-form-wrap">
          <h2>欢迎回来</h2>
          <p className="login-subtitle">新的一天，从清晰的安排开始。</p>
          {message && !error && <Notice>{message}</Notice>}
          {help && (
            <Notice onClose={() => setHelp(false)}>
              请使用管理员分配的 HAA
              账号登录。如需创建账号或重置密码，请联系部署管理员。学校账号将在登录后的向导中连接。
            </Notice>
          )}
          <form className="login-form" onSubmit={submit} aria-busy={busy}>
            <label htmlFor="username">账号</label>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                maxLength={32}
                placeholder="请输入 HAA 账号"
                disabled={busy}
              />
            </div>
            <div className="label-line">
              <label htmlFor="password">密码</label>
              <button type="button" className="text-button" onClick={() => setHelp(true)}>
                忘记密码？
              </button>
            </div>
            <div className="input-with-icon">
              <LockKeyhole size={18} />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={72}
                placeholder="请输入密码"
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="button button-primary login-submit" disabled={busy} type="submit">
              {busy ? (
                <>
                  <Spinner />
                  正在登录
                </>
              ) : (
                <>
                  登录 <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <button className="button preview-entry" type="button" onClick={onPreview}>
            先体验工作台 <ArrowRight size={16} />
          </button>
          <p className="preview-entry-note">无需登录 · 本地示例数据</p>
          <div className="login-separator">
            <span />
            第一次来到这里？
            <span />
          </div>
          <div className="first-time-note">
            <span className="note-dot" />
            <p>
              登录后，我们会带你连接学习平台，
              <br />
              设置学期和专属时间表。
            </p>
          </div>
        </div>
        <footer className="login-footer">
          <LockKeyhole size={13} />
          <span>你的连接和学业数据，始终属于你。</span>
        </footer>
      </section>
    </main>
  )
}
