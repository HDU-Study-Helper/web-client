import { useEffect, useState } from 'react'
import { api } from './api'
import type { User } from './types'
import Login from './components/Login'
import Wizard from './components/Wizard'
import { Brand, Spinner } from './components/UI'
import Workspace from './components/Workspace'
import { demoUser } from './data/mock'
import { loadDraft } from './setup'

export default function App() {
  const [preview, setPreview] = useState(
    () => new URLSearchParams(window.location.search).get('demo') === '1',
  )
  const [workspace, setWorkspace] = useState(false)
  const [user, setUser] = useState<User>()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (preview) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const expire = () => {
      setUser(undefined)
      setWorkspace(false)
      setMessage('登录已过期，请重新登录。设置草稿会为你保留。')
    }
    window.addEventListener('haa:session-expired', expire)
    void api<User>('/auth/me', { signal: controller.signal, sessionCheck: false })
      .then((value) => {
        if (!controller.signal.aborted) {
          setUser(value)
          setWorkspace(loadDraft(value.id).completed)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.status !== 401)
          setMessage('暂时无法恢复会话，请检查服务连接后重试。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      window.removeEventListener('haa:session-expired', expire)
    }
  }, [preview])
  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(undefined)
    setWorkspace(false)
    setMessage('已安全退出登录。')
  }
  if (loading)
    return (
      <div className="app-loading">
        <Brand />
        <Spinner />
        <p>正在打开你的学期…</p>
      </div>
    )
  function exitPreview() {
    window.history.replaceState(null, '', window.location.pathname)
    setLoading(true)
    setPreview(false)
  }
  if (preview)
    return (
      <Workspace
        user={demoUser}
        preview
        onLogout={async () => exitPreview()}
        onSettings={exitPreview}
      />
    )
  return user ? (
    workspace ? (
      <Workspace user={user} onLogout={logout} onSettings={() => setWorkspace(false)} />
    ) : (
      <Wizard key={user.id} user={user} onLogout={logout} onComplete={() => setWorkspace(true)} />
    )
  ) : (
    <Login
      message={message}
      onLogin={(value) => {
        setUser(value)
        setWorkspace(loadDraft(value.id).completed)
        setMessage('')
      }}
      onPreview={() => {
        window.history.replaceState(null, '', `${window.location.pathname}?demo=1`)
        setPreview(true)
      }}
    />
  )
}
