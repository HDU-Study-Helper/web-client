import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, Check, LoaderCircle, X } from 'lucide-react'
import PixelComputer from './PixelComputer'

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <PixelComputer className="brand-computer" />
      <div>
        <span className="brand-name">Academic Assistant</span>
      </div>
    </div>
  )
}
export function Spinner({ label = '正在加载' }: { label?: string }) {
  return <LoaderCircle className="spinner" size={18} aria-label={label} />
}
export function Notice({
  children,
  tone = 'info',
  onClose,
}: {
  children: ReactNode
  tone?: 'info' | 'error' | 'success'
  onClose?: () => void
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' ? <Check size={17} /> : <AlertCircle size={17} />}
      <div>{children}</div>
      {onClose && (
        <button className="icon-button" type="button" aria-label="关闭提示" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const cancel = (event: Event) => {
      event.preventDefault()
      if (!busyRef.current) closeRef.current()
    }
    dialog.addEventListener('cancel', cancel)
    return () => {
      dialog.removeEventListener('cancel', cancel)
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" aria-busy={busy}>
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭弹窗"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
