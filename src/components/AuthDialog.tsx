import { useEffect, useId, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowUpRight, CheckCheck, Clock3, QrCode, RotateCw } from 'lucide-react'
import { api, connectionPath, dwsPath, errorMessage, safeHTTPS } from '../api'
import type { Connection, DWSAuth, PlatformAuth } from '../types'
import { Modal, Notice, Spinner, type ModalHandle } from './UI'

interface Challenge {
  connection: string
  challenge?: string
  auth: PlatformAuth | DWSAuth
}
export default function AuthDialog({
  source,
  name,
  existing,
  onClose,
  onConnected,
}: {
  source: string
  name: string
  existing?: Connection
  onClose: () => void
  onConnected: () => void
}) {
  const [challenge, setChallenge] = useState<Challenge>()
  const [error, setError] = useState('')
  const [image, setImage] = useState('')
  const [retry, setRetry] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const [copyMessage, setCopyMessage] = useState('')
  const descriptionId = useId()
  const modalRef = useRef<ModalHandle>(null)
  const initialCancelRef = useRef<HTMLButtonElement>(null)
  const officialLinkRef = useRef<HTMLAnchorElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const current = useRef<Challenge>(undefined)
  const paused = useRef(false)
  const closing = useRef(false)
  const stop = useRef<() => void>(() => {})
  const connectedCallback = useRef(onConnected)
  connectedCallback.current = onConnected
  const dws = source === 'dws'
  useEffect(() => {
    // This same-URL entry lets Back dismiss the dialog without consuming the page beneath it.
    const marker = `auth-${crypto.randomUUID()}`
    const url = window.location.href
    const state = window.history.state
    window.history.pushState({ ...state, haaAuthDialog: marker }, '', url)
    const onPopState = () => {
      if (window.history.state?.haaAuthDialog !== marker) modalRef.current?.close()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      closing.current = true
      window.removeEventListener('popstate', onPopState)
      // Never rewind an entry installed by external navigation while the dialog was open.
      if (window.history.state?.haaAuthDialog === marker && window.location.href === url) {
        window.history.back()
      }
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let disposed = false
    const clockTimer = setInterval(() => setClock(Date.now()), 1000)
    const dispose = () => {
      disposed = true
      clearTimeout(timer)
      clearInterval(clockTimer)
      controller.abort()
    }
    stop.current = dispose
    const previous = current.current
    const canResume =
      previous &&
      !['expired', 'failed', 'cancelled', 'authorized'].includes(previous.auth.status) &&
      Date.parse(previous.auth.expires_at) > Date.now()
    paused.current = false
    if (!canResume) {
      current.current = undefined
      setChallenge(undefined)
      setImage('')
    }
    setError('')
    setCopyMessage('')
    function finish() {
      // Keep the success live region mounted long enough to announce it; dismissal cancels this timer.
      clearTimeout(timer)
      clearInterval(clockTimer)
      timer = setTimeout(() => {
        if (!disposed && !closing.current) modalRef.current?.close(() => connectedCallback.current())
      }, 1000)
    }
    async function run() {
      try {
        if (canResume) {
          await poll(previous)
          return
        }
        let next: Challenge
        if (dws) {
          const auth = await api<DWSAuth>(existing ? `${dwsPath(existing.id)}/link` : '/dws/link', {
            method: 'POST',
            signal: controller.signal,
          })
          next = { connection: auth.connection_id, challenge: auth.id, auth }
        } else {
          const data = await api<{ connection: Connection; auth: PlatformAuth }>(
            `/platforms/${encodeURIComponent(source)}/auth`,
            { method: 'POST', signal: controller.signal },
          )
          next = { connection: data.connection.id, auth: data.auth }
        }
        if (disposed) return
        current.current = next
        setChallenge(next)
        if (next.auth.status === 'authorized') {
          finish()
          return
        }
        await makeImage(next.auth)
        schedule(next)
      } catch (error) {
        if (!disposed) setError(errorMessage(error))
      }
    }
    async function makeImage(auth: PlatformAuth | DWSAuth) {
      if ('qr_image' in auth && auth.qr_image?.match(/^data:image\/(png|jpeg);base64,/)) {
        setImage(auth.qr_image)
        return
      }
      const uri =
        'verification_uri' in auth
          ? safeHTTPS(auth.verification_uri)
          : 'qr_url' in auth
            ? safeHTTPS(auth.qr_url)
            : undefined
      if (uri) {
        const data = await QRCode.toDataURL(uri, {
          width: 240,
          margin: 2,
          color: { dark: '#203044', light: '#ffffff' },
        })
        if (!disposed) setImage(data)
      }
    }
    function schedule(value: Challenge) {
      if (
        disposed ||
        paused.current ||
        ['expired', 'failed', 'cancelled', 'authorized'].includes(value.auth.status)
      )
        return
      const delay =
        'poll_after_ms' in value.auth
          ? Math.min(30000, Math.max(2000, value.auth.poll_after_ms || 2000))
          : 2000
      timer = setTimeout(() => void poll(value), delay)
    }
    async function poll(value: Challenge) {
      if (disposed || paused.current) return
      try {
        const auth = await api<PlatformAuth | DWSAuth>(
          dws
            ? `${dwsPath(value.connection)}/link/${encodeURIComponent(value.challenge!)}`
            : `${connectionPath(value.connection)}/auth`,
          { signal: controller.signal },
        )
        if (disposed || paused.current) return
        const next = { ...value, auth }
        current.current = next
        setChallenge(next)
        if (auth.status === 'authorized') {
          finish()
          return
        }
        await makeImage(auth)
        schedule(next)
      } catch (error) {
        if (!disposed) setError(errorMessage(error))
      }
    }
    void run()
    return dispose
  }, [source, dws, existing?.id, retry])
  const auth = challenge?.auth
  const expires = auth ? Math.max(0, Math.ceil((Date.parse(auth.expires_at) - clock) / 1000)) : 0
  const terminal =
    !!auth &&
    auth.status !== 'authorized' &&
    (['expired', 'failed', 'cancelled'].includes(auth.status) ||
      (Number.isFinite(expires) && expires === 0))
  const status = error
    ? 'failed'
    : auth?.status === 'authorized'
      ? 'authorized'
      : terminal
        ? auth?.status === 'failed'
          ? 'failed'
          : 'expired'
        : auth?.status === 'scanned'
          ? 'scanned'
          : 'pending'
  const statusMessage = {
    pending: '等待扫码授权',
    scanned: '已扫码，请在手机上确认',
    authorized: '授权成功，正在完成连接',
    expired: '二维码已失效，请重新获取',
    failed: '授权未完成，请重试',
  }[status]
  const uri = auth
    ? 'verification_uri' in auth
      ? safeHTTPS(auth.verification_uri)
      : 'qr_url' in auth
        ? safeHTTPS(auth.qr_url)
        : undefined
    : undefined
  useEffect(() => {
    // Only hand off the initial focus; never override keyboard or pointer navigation.
    if (uri && document.activeElement === initialCancelRef.current) officialLinkRef.current?.focus()
  }, [uri])
  useEffect(() => {
    if (status === 'expired' || status === 'failed') retryRef.current?.focus()
  }, [status])
  function stopForDismiss() {
    closing.current = true
    paused.current = true
    stop.current()
  }
  function cancel() {
    stopForDismiss()
    const value = current.current
    onClose()
    // Server cleanup must not keep the dialog open or report late errors after dismissal.
    if (value && !['authorized', 'expired', 'failed', 'cancelled'].includes(value.auth.status)) {
      void (async () => {
        const options = { signal: AbortSignal.timeout(10000), sessionCheck: false }
        if (dws) {
          await api<DWSAuth>(
            `${dwsPath(value.connection)}/link/${encodeURIComponent(value.challenge!)}`,
            { ...options, method: 'DELETE' },
          )
        } else {
          // A lost poll response may already have activated this connection.
          const latest = await api<PlatformAuth>(
            `${connectionPath(value.connection)}/auth`,
            options,
          )
          if (latest.status !== 'authorized') {
            await api(connectionPath(value.connection) + '/', { ...options, method: 'DELETE' })
          }
        }
      })().catch(() => {
        // The page refresh on close reconciles connection state; a dismissed dialog stays dismissed.
      })
    }
  }
  async function copyLink() {
    if (!uri) return
    try {
      await navigator.clipboard.writeText(uri)
      if (!closing.current) setCopyMessage('安全授权链接已复制。')
    } catch {
      if (!closing.current) setCopyMessage('未能复制，请使用上方官方授权链接。')
    }
  }
  return (
    <Modal
      title={`连接${name}`}
      onClose={cancel}
      closeHandleRef={modalRef}
      onDismissStart={stopForDismiss}
      descriptionId={descriptionId}
      initialFocusRef={initialCancelRef}
    >
      <p id={descriptionId} className="modal-description">
        {dws
          ? '使用钉钉扫码，或打开官方授权页完成连接。'
          : uri
            ? `打开${name}官方授权页，或使用另一台设备上的${name} App 扫描下方二维码，并确认登录。`
            : `请使用另一台设备上的${name} App 扫描下方二维码，并确认登录；此授权方式需要第二台设备。`}
      </p>
      <div className={`qr-box ${terminal ? 'qr-expired' : ''}`}>
        {image ? (
          <img src={image} alt={`${name}授权二维码`} width={224} height={224} />
        ) : (
          <div className="qr-placeholder">
            {error || terminal ? <QrCode size={48} /> : <Spinner label="正在获取二维码" />}
          </div>
        )}
        {terminal && (
          <div className="qr-overlay">
            <Clock3 size={24} />
            <strong>{auth?.status === 'failed' ? '授权未完成' : '二维码已失效'}</strong>
            <span>请重新获取后扫码</span>
          </div>
        )}
      </div>
      <div
        className="auth-status"
        role="status"
        aria-label="授权状态"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="pulse-dot" aria-hidden="true" />
        {statusMessage}
      </div>
      {auth && !terminal && status !== 'authorized' && expires > 0 && Number.isFinite(expires) && (
        <div className="muted" aria-hidden="true">
          {Math.floor(expires / 60)}:{String(expires % 60).padStart(2, '0')}
        </div>
      )}
      {auth && 'user_code' in auth && auth.user_code && !terminal && (
        <div className="device-code">
          <span>如授权页提示，请输入此验证码</span>
          <strong>{auth.user_code}</strong>
        </div>
      )}
      {uri && !terminal && (
        <>
          <a
            ref={officialLinkRef}
            className="button button-secondary full-width"
            href={uri}
            target="_blank"
            rel="noopener noreferrer"
          >
            打开{name}官方授权页（新窗口） <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <button type="button" className="text-button" onClick={() => void copyLink()}>
            复制{name}安全授权链接
          </button>
          {copyMessage && <Notice tone="info">{copyMessage}</Notice>}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {(terminal || error) && (
        <button
          ref={retryRef}
          type="button"
          className="button button-primary full-width"
          onClick={() => setRetry((value) => value + 1)}
        >
          <RotateCw size={16} />
          {error && !terminal && challenge ? '继续检查授权' : '重新获取'}
        </button>
      )}
      <button
        ref={initialCancelRef}
        type="button"
        className={`button ${!challenge && !error ? 'button-primary' : 'button-secondary'} full-width`}
        onClick={() => modalRef.current?.close()}
      >
        取消连接
      </button>
      {error && challenge && (
        <button type="button" className="text-button auth-dismiss" onClick={() => modalRef.current?.close()}>
          暂时关闭，稍后继续连接
        </button>
      )}
      <p className="privacy-note">
        <CheckCheck size={15} />
        仅连接你授权的平台账号
      </p>
    </Modal>
  )
}
