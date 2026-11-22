import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, errorMessage } from './api'

export type LiveChatMessage = { id: string; role: 'user' | 'assistant'; text: string }
export type Question = {
  id: string
  type: 'CHOICE' | 'TEXT_INPUT' | 'CONFIRM'
  text: string
  options: { id: string; label: string }[]
}

type Turn = {
  turn_id: string
  kind: 'message' | 'answer'
  message: string
  question_id?: string
  state: 'running' | 'completed' | 'failed' | 'interrupted'
  output?: { text?: string }
  error_code?: string
}
type History = {
  turns: Turn[]
  pending_questions:
    | {
        question_id: string
        type: Question['type']
        question?: string
        text?: string
        options?: Question['options'] | null
      }[]
    | null
}
type Submission = {
  id: string
  text: string
  questionID?: string
  before: Set<string>
  turn?: Turn
  error?: string
  uncertain?: boolean
  misses: number
}
type View = {
  messages: LiveChatMessage[]
  questions: Question[]
  busy: boolean
  error: string
  poll: boolean
}
type Session = {
  key: string
  controller: AbortController
  thread?: string
  turns: Turn[]
  questions: Question[]
  pending?: Submission
  hydrated: boolean
  writing: boolean
  loading?: Promise<void>
  revision: number
  error: string
  publish: (view: View) => void
  notify: () => void
}

const emptyView: View = { messages: [], questions: [], busy: false, error: '', poll: false }
const readTimeout = 15_000
const pollDelay = 2_000
const submissionTimeout = 600_000
const reconcileAttempts = 3
const uncertainError = '未能确认消息是否已提交。请刷新会话并检查结果，不要直接重发。'
const chatPath = (id: string) => `/chat/threads/${encodeURIComponent(id)}`
const active = (session: Session) => !session.controller.signal.aborted
const running = (session: Session) => session.turns.some((turn) => turn.state === 'running')
const reconciling = (pending?: Submission) => Boolean(pending && pending.misses < reconcileAttempts)
const busy = (session: Session) =>
  session.writing ||
  reconciling(session.pending) ||
  Boolean(session.loading) ||
  running(session) ||
  Boolean(session.thread && !session.hydrated && !session.error)

function validTurn(turn: Turn): boolean {
  return (
    typeof turn?.turn_id === 'string' &&
    Boolean(turn.turn_id) &&
    typeof turn.message === 'string' &&
    (turn.kind === 'message' || turn.kind === 'answer') &&
    ['running', 'completed', 'failed', 'interrupted'].includes(turn.state)
  )
}

function storedThread(key: string): string | undefined {
  try {
    return localStorage.getItem(key) || undefined
  } catch {
    return undefined
  }
}

function storeThread(key: string, thread: string | undefined) {
  try {
    if (thread) localStorage.setItem(key, thread)
    else localStorage.removeItem(key)
  } catch {
    /* The conversation remains available for this mount. */
  }
}

function publish(session: Session) {
  if (!active(session)) return
  const messages: LiveChatMessage[] = []
  for (const turn of session.turns) {
    messages.push({ id: `${turn.turn_id}:user`, role: 'user', text: turn.message })
    if (turn.state === 'completed' && typeof turn.output?.text === 'string') {
      messages.push({ id: `${turn.turn_id}:assistant`, role: 'assistant', text: turn.output.text })
    }
  }
  const pending = session.pending
  if (pending && !matchingTurn(session.turns, pending)) {
    messages.push({ id: `${pending.id}:local`, role: 'user', text: pending.text })
  }
  session.publish({
    messages,
    questions: session.questions,
    busy: busy(session),
    error: session.error,
    poll: !session.writing && !session.loading && (reconciling(pending) || running(session)),
  })
}

function matchingTurn(turns: Turn[], pending: Submission) {
  if (pending.turn) return turns.find((turn) => turn.turn_id === pending.turn?.turn_id)
  // History does not expose request_id. Only correlate an otherwise unknown
  // submission to a single matching turn not present before sending.
  const matches = turns.filter(
    (turn) =>
      !pending.before.has(turn.turn_id) &&
      turn.message === pending.text &&
      (pending.questionID
        ? turn.kind === 'answer' && turn.question_id === pending.questionID
        : turn.kind === 'message'),
  )
  return matches.length === 1 ? matches[0] : undefined
}

function turnError(turn: Turn | undefined): string {
  if (turn?.state === 'interrupted') return '处理已中断。已提交的操作不会回滚，请先检查结果。'
  if (turn?.state !== 'failed') return ''
  if (turn.error_code === 'MODEL_SERVICE_SELECTION_REQUIRED')
    return '有多个可用模型服务，请在框架配置中选择默认模型服务。'
  if (turn.error_code === 'PROVIDER_ERROR') return '模型服务不可用，请检查服务配置。'
  if (turn.error_code === 'RATE_LIMITED') return '模型服务或智能体暂时达到请求限制，请稍后再试。'
  return '处理未完成。已提交的操作不会回滚，请先检查结果。'
}

function setThread(session: Session, thread?: string) {
  session.thread = thread
  session.turns = []
  session.questions = []
  session.hydrated = true
  storeThread(session.key, thread)
}

async function createThread(session: Session) {
  const value = await api<{ thread_id: string }>('/chat/threads', {
    method: 'POST',
    signal: session.controller.signal,
    timeoutMs: readTimeout,
  })
  if (!value?.thread_id || typeof value.thread_id !== 'string')
    throw new Error('服务未返回有效的会话。')
  if (active(session)) setThread(session, value.thread_id)
  return value.thread_id
}

function refreshHistory(session: Session): Promise<void> {
  const thread = session.thread
  if (!thread || !active(session) || session.writing) return Promise.resolve()
  if (session.loading) return session.loading
  const revision = session.revision
  const current = () => active(session) && session.revision === revision

  session.loading = (async () => {
    let settled = false
    try {
      const history = await api<History>(chatPath(thread), {
        signal: session.controller.signal,
        timeoutMs: readTimeout,
      })
      if (!current()) return
      if (
        !Array.isArray(history?.turns) ||
        !history.turns.every(validTurn) ||
        !(history.pending_questions === null || Array.isArray(history.pending_questions))
      ) {
        throw new Error('服务未返回有效的会话记录。')
      }
      const questions = (history.pending_questions ?? []).map((q) => ({
        id: q.question_id,
        type: q.type,
        text: q.question || q.text || '',
        options: q.options ?? [],
      }))
      const wasRunning = running(session)
      const pending = session.pending
      session.turns = history.turns
      session.questions = questions
      session.hydrated = true
      const stillRunning = running(session)
      session.error = turnError(session.turns.at(-1))
      if (pending) {
        const turn = matchingTurn(session.turns, pending) ?? pending.turn
        if (turn?.state === 'running') {
          pending.turn = turn
          pending.misses = 0
          session.error = ''
        } else if (turn || !pending.uncertain) {
          session.pending = undefined
          session.error = turn?.state === 'completed' ? '' : turnError(turn) || pending.error || ''
          settled = !stillRunning
        } else if (!stillRunning) {
          // Keep an unresolved intent available for later manual reconciliation;
          // stop short polling, but never treat a missing receipt as a rejection.
          pending.misses = Math.min(pending.misses + 1, reconcileAttempts)
          session.error = pending.error || uncertainError
        }
      } else if (wasRunning && !stillRunning) {
        settled = true
      }
    } catch (error) {
      if (!current()) return
      const pending = session.pending
      const wasRunning = running(session)
      if (error instanceof ApiError && error.status === 404 && error.code === 'not_found') {
        if (storedThread(session.key) === thread) storeThread(session.key, undefined)
        session.thread = undefined
        session.turns = []
        session.questions = []
        session.hydrated = true
        session.pending = undefined
        session.error = '此会话已不可用，可以开始新会话。'
        settled = Boolean(pending) || wasRunning
      } else {
        session.questions = []
        session.error =
          pending?.error ||
          (wasRunning
            ? '暂时无法更新处理状态，将在会话打开时继续检查。'
            : `无法刷新会话记录：${errorMessage(error)}`)
        if (pending && !wasRunning) {
          if (pending.turn || !pending.uncertain) {
            session.pending = undefined
            settled = true
          } else {
            pending.misses = Math.min(pending.misses + 1, reconcileAttempts)
          }
        }
      }
    } finally {
      if (current()) {
        session.loading = undefined
        publish(session)
        if (settled) session.notify()
      }
    }
  })()
  publish(session)
  return session.loading
}

async function submit(session: Session, pending: Submission) {
  try {
    const thread = session.thread ?? (await createThread(session))
    if (!active(session)) return
    try {
      const response = await api<Turn>(
        `${chatPath(thread)}/${pending.questionID ? 'answers' : 'messages'}`,
        {
          method: 'POST',
          body: {
            request_id: pending.id,
            message: pending.text,
            ...(pending.questionID ? { question_id: pending.questionID } : {}),
          },
          signal: session.controller.signal,
          timeoutMs: submissionTimeout,
        },
      )
      if (!validTurn(response)) {
        throw new Error(uncertainError)
      }
      if (active(session)) {
        pending.turn = response
        session.turns = [
          ...session.turns.filter((turn) => turn.turn_id !== response.turn_id),
          response,
        ]
      }
    } catch (error) {
      pending.uncertain =
        !(error instanceof ApiError) || error.status >= 500 || error.code === 'http_error'
      pending.error = pending.uncertain ? uncertainError : errorMessage(error)
    }
  } catch (error) {
    if (!active(session)) return
    session.pending = undefined
    session.error = `无法开始会话：${errorMessage(error)}`
  } finally {
    if (active(session)) {
      session.writing = false
      publish(session)
      if (session.pending) await refreshHistory(session)
    }
  }
}

/** Owner-scoped App Chat. Post each user intent once; recover by reading history. */
export function useLiveChat(
  userID: string,
  enabled: boolean,
  open: boolean,
  onSettled?: () => void | Promise<void>,
) {
  const key = `haa:chat-thread:v1:${userID}`
  const sessionRef = useRef<Session>(undefined)
  const callback = useRef(onSettled)
  const [snapshot, setSnapshot] = useState<{ key: string; view: View }>()
  useEffect(() => {
    callback.current = onSettled
  }, [onSettled])

  useEffect(() => {
    if (!enabled) return
    const thread = storedThread(key)
    const session: Session = {
      key,
      controller: new AbortController(),
      thread,
      turns: [],
      questions: [],
      hydrated: !thread,
      writing: false,
      revision: 0,
      error: '',
      publish: (view) => setSnapshot({ key, view }),
      notify: () => {
        void Promise.resolve()
          .then(() => {
            if (active(session)) return callback.current?.()
          })
          .catch(() => {
            /* A side-panel refresh must not fail Chat. */
          })
      },
    }
    sessionRef.current = session
    publish(session)
    return () => {
      session.controller.abort()
      sessionRef.current = undefined
    }
  }, [enabled, key])

  const refresh = useCallback(() => {
    const session = sessionRef.current
    return enabled && session?.key === key ? refreshHistory(session) : Promise.resolve()
  }, [enabled, key])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])
  const view = enabled && snapshot?.key === key ? snapshot.view : emptyView
  useEffect(() => {
    if (!open || !view.poll) return
    const timer = setTimeout(() => void refresh(), pollDelay)
    return () => clearTimeout(timer)
  }, [open, refresh, view])

  const send = useCallback(
    (text: string, questionID?: string): boolean => {
      const session = sessionRef.current
      text = text.trim()
      if (!enabled || !session || session.key !== key || !text || busy(session)) return false
      if (!session.hydrated) {
        void refreshHistory(session)
        return false
      }
      if (questionID && !session.questions.some((question) => question.id === questionID))
        return false
      // A duplicate click/resubmission must not turn a missing receipt into a
      // second action. Refresh or move to a new conversation instead.
      if (session.pending?.text === text && session.pending.questionID === questionID) {
        void refreshHistory(session)
        return false
      }
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
      const pending: Submission = {
        id,
        text,
        questionID,
        before: new Set(session.turns.map((turn) => turn.turn_id)),
        misses: 0,
      }
      session.pending = pending
      session.writing = true
      session.error = ''
      publish(session)
      void submit(session, pending)
      return true
    },
    [enabled, key],
  )

  const newThread = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current
    if (!enabled || !session || session.key !== key || session.writing) return false
    // Switching the pointer is not a DELETE and does not resend anything on the old thread.
    session.revision++
    session.loading = undefined
    session.writing = true
    session.error = ''
    publish(session)
    try {
      await createThread(session)
      if (!active(session)) return false
      session.pending = undefined
      return true
    } catch (error) {
      session.error = `无法开始新会话：${errorMessage(error)}`
      return false
    } finally {
      session.writing = false
      publish(session)
    }
  }, [enabled, key])

  const { messages, questions, busy: isBusy, error } = view
  return { messages, questions, busy: isBusy, error, send, newThread, refresh }
}
