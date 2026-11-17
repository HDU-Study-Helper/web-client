import { useEffect, useId, useImperativeHandle, useRef, type ReactNode, type RefObject } from 'react'

export interface ModalHandle { close: (action?: () => void) => void }
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
  descriptionId,
  initialFocusRef,
  closeHandleRef,
  onDismissStart,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  descriptionId?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  closeHandleRef?: RefObject<ModalHandle | null>
  onDismissStart?: () => void
}) {
  const titleId = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  const closing = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const finishClose = useRef<(() => void) | undefined>(undefined)
  const backdropPointer = useRef<number | undefined>(undefined)
  const dismissStartRef = useRef(onDismissStart)
  closeRef.current = onClose
  dismissStartRef.current = onDismissStart
  function beginClose(action?: () => void) {
    if (closing.current) return
    closing.current = true
    // Keep the top-layer backdrop while preventing controls from firing during exit.
    ref.current?.querySelectorAll<HTMLElement>('[data-modal-content]').forEach((content) => { content.inert = true })
    // Stop work immediately; keep the native modal mounted during its exit.
    dismissStartRef.current?.()
    const finish = () => {
      if (!finishClose.current) return
      finishClose.current = undefined
      clearTimeout(closeTimer.current)
      ;(action || closeRef.current)()
    }
    finishClose.current = finish
    const dialog = ref.current
    if (!dialog || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    dialog.dataset.closing = 'true'
    // Fallback covers interrupted animations and browser background throttling.
    closeTimer.current = setTimeout(finish, 240)
  }
  useImperativeHandle(closeHandleRef, () => ({ close: beginClose }))
  function outside(clientX: number, clientY: number) {
    const bounds = ref.current?.getBoundingClientRect()
    return !!bounds && (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom)
  }
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    closing.current = false
    delete dialog.dataset.closing
    dialog.showModal()
    initialFocusRef?.current?.focus({ preventScroll: true })
    const cancel = (event: Event) => {
      event.preventDefault()
      beginClose()
    }
    dialog.addEventListener('cancel', cancel)
    return () => {
      dialog.removeEventListener('cancel', cancel)
      clearTimeout(closeTimer.current)
      finishClose.current = undefined
      dialog.close()
      if (!previous?.isConnected) return
      if (!previous.matches(':disabled')) {
        previous.focus({ preventScroll: true })
        return
      }
      // Closing an auth dialog refreshes its trigger, temporarily disabling the button.
      const stopRestoring = () => {
        observer.disconnect()
        document.removeEventListener('focusin', stopRestoring)
        window.removeEventListener('pagehide', stopRestoring)
      }
      const observer = new MutationObserver(() => {
        if (!previous.isConnected) {
          stopRestoring()
        } else if (!previous.matches(':disabled')) {
          stopRestoring()
          if (document.activeElement === document.body) previous.focus({ preventScroll: true })
        }
      })
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled'],
      })
      document.addEventListener('focusin', stopRestoring)
      window.addEventListener('pagehide', stopRestoring)
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      onPointerDown={(event) => {
        backdropPointer.current = event.button === 0 && event.target === event.currentTarget && outside(event.clientX, event.clientY) ? event.pointerId : undefined
      }}
      onPointerUp={(event) => {
        const startedOutside = backdropPointer.current === event.pointerId
        backdropPointer.current = undefined
        if (startedOutside && event.target === event.currentTarget && outside(event.clientX, event.clientY)) beginClose()
      }}
      onPointerCancel={() => { backdropPointer.current = undefined }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'modal-out') finishClose.current?.()
      }}
    >
      <div className="modal-heading" data-modal-content>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭弹窗"
          onClick={() => beginClose()}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-content" data-modal-content>{children}</div>
    </dialog>
  )
}
