import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowUpRight, CheckCheck, Clock3, QrCode, RotateCw } from 'lucide-react'
import { api, connectionPath, dwsPath, errorMessage, safeHTTPS } from '../api'
import type { Connection, DWSAuth, PlatformAuth } from '../types'
import { Modal, Notice, Spinner } from './UI'

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
  const [cancelling, setCancelling] = useState(false)
  const current = useRef<Challenge>(undefined)
  const paused = useRef(false)
  const connectedCallback = useRef(onConnected)
  connectedCallback.current = onConnected
  const dws = source === 'dws'
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let disposed = false
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
          connectedCallback.current()
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
      if (paused.current) return
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
          connectedCallback.current()
          return
        }
        await makeImage(auth)
        schedule(next)
      } catch (error) {
        if (!disposed) setError(errorMessage(error))
      }
    }
    void run()
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [source, dws, existing?.id, retry])
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const auth = challenge?.auth
  const expires = auth ? Math.max(0, Math.ceil((Date.parse(auth.expires_at) - clock) / 1000)) : 0
  const terminal =
    !!auth &&
    (['expired', 'failed', 'cancelled'].includes(auth.status) ||
      (Number.isFinite(expires) && expires === 0))
  const uri = auth && 'verification_uri' in auth ? safeHTTPS(auth.verification_uri) : undefined
  async function cancel() {
    if (cancelling) return
    paused.current = true
    setCancelling(true)
    setError('')
    const value = current.current
    try {
      if (value && !['authorized', 'expired', 'failed', 'cancelled'].includes(value.auth.status)) {
        if (dws) {
          const result = await api<DWSAuth>(
            `${dwsPath(value.connection)}/link/${encodeURIComponent(value.challenge!)}`,
            { method: 'DELETE' },
          )
          if (result.status === 'authorized') {
            connectedCallback.current()
            return
          }
        } else {
          // A lost poll response may already have activated this connection.
          const latest = await api<PlatformAuth>(`${connectionPath(value.connection)}/auth`)
          if (latest.status === 'authorized') {
            connectedCallback.current()
            return
          }
          await api(connectionPath(value.connection) + '/', { method: 'DELETE' })
        }
      }
      onClose()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setCancelling(false)
    }
  }
  return (
    <Modal
      title={`连接${name}`}
      onClose={() => void cancel()}
      busy={cancelling || (!challenge && !error)}
    >
      <p className="modal-description">
        {dws
          ? '使用钉钉扫码，或打开官方授权页完成连接。'
          : `请使用${name} App 扫描下方二维码，并确认登录。`}
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
      {auth && !terminal && (
        <div className="auth-status">
          <span className="pulse-dot" />
          {auth.status === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码授权'}
          {expires > 0 && Number.isFinite(expires) && (
            <span className="muted">
              {Math.floor(expires / 60)}:{String(expires % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      )}
      {auth && 'user_code' in auth && auth.user_code && !terminal && (
        <div className="device-code">
          <span>如授权页提示，请输入此验证码</span>
          <strong>{auth.user_code}</strong>
        </div>
      )}
      {uri && !terminal && (
        <a
          className="button button-secondary full-width"
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
        >
          打开钉钉官方授权页 <ArrowUpRight size={16} />
        </a>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {(terminal || error) && (
        <button
          type="button"
          className="button button-primary full-width"
          onClick={() => setRetry((value) => value + 1)}
          disabled={cancelling}
        >
          <RotateCw size={16} />
          {error && !terminal && challenge ? '继续检查授权' : '重新获取'}
        </button>
      )}
      {error && challenge && (
        <button
          type="button"
          className="text-button auth-dismiss"
          onClick={onClose}
          disabled={cancelling}
        >
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
