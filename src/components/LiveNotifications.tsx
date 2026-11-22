import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, Bell, MessageCircle } from 'lucide-react'
import { ApiError, api, errorMessage } from '../api'
import { Modal, Notice, Spinner } from './UI'

type NoticeRecord = {
  id: string
  updated_at: string
  input: {
    title: string
    body: string
    mode: 'active' | 'silent'
    evidence?: string[] | null
    idempotency_key?: string
  }
}

type SilentQuestion = {
  question_id: string
  source_key: string
  question: string
  text: string
  role: string
  type: 'CHOICE' | 'CONFIRM' | 'TEXT_INPUT'
  options?: { id: string; label: string }[] | null
}

type Feed<T> = { items: T[]; loading: boolean; error?: string }
type NoticePage = { items: NoticeRecord[] | null; next_offset: number }
type AnswerReceipt = { result?: { summary?: string } }
type AnswerState =
  | { id: string; status: 'submitting' }
  | { id: string; status: 'sent'; message: string }
  | { id: string; status: 'failed'; message: string }
type Selection = { kind: 'notice'; item: NoticeRecord } | { kind: 'question'; item: SilentQuestion }

const pageSize = 20
const filters = ['全部', '通知', '提问'] as const
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
const longDate = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

function questionText(question: SilentQuestion) {
  return question.question || question.text
}

function questionSource(question: SilentQuestion) {
  if (question.role === 'worker') return '任务助手'
  if (question.role === 'learner') return '流程助手'
  return '后台任务'
}

function noticeLabel(notice: NoticeRecord) {
  return notice.input.mode === 'active' ? '主动通知' : '静默通知'
}

function RecordedAt({ value, detailed = false }: { value: string; detailed?: boolean }) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return <time dateTime={value}>{(detailed ? longDate : shortDate).format(date)}</time>
}

function isQuestionNotice(notice: NoticeRecord, questionRefs: Set<string>) {
  // The ChA feed owns the actionable row; the server keeps its backing notice after the answer.
  return (
    notice.id.startsWith('question:') ||
    notice.input.idempotency_key?.startsWith('internal:question:') ||
    notice.input.evidence?.some((ref) => questionRefs.has(ref))
  )
}

async function getNoticePage(offset: number, signal: AbortSignal) {
  const result = await api<NoticePage>(`/chat/notices?limit=${pageSize}&offset=${offset}`, {
    signal,
  })
  const items = result.items ?? []
  const next = result.next_offset
  return {
    items,
    nextOffset: items.length === pageSize && next > offset && next <= 100_000 ? next : undefined,
  }
}

function AnswerStatus({ answer }: { answer: AnswerState }) {
  if (answer.status === 'submitting') {
    return <Notice>正在提交回答。你可以关闭窗口，提交仍会继续。</Notice>
  }
  return <Notice tone={answer.status === 'sent' ? 'success' : 'error'}>{answer.message}</Notice>
}

export default function LiveNotifications({
  revision,
  onSettled,
}: {
  revision: number
  onSettled?: () => void
}) {
  const [noticeFeed, setNoticeFeed] = useState<Feed<NoticeRecord> & { nextOffset?: number }>({
    items: [],
    loading: true,
  })
  const [questionFeed, setQuestionFeed] = useState<Feed<SilentQuestion>>({
    items: [],
    loading: true,
  })
  const [refresh, setRefresh] = useState(0)
  const [filter, setFilter] = useState<(typeof filters)[number]>('全部')
  const [selected, setSelected] = useState<Selection>()
  const [draft, setDraft] = useState('')
  const [answer, setAnswer] = useState<AnswerState>()
  const [moreError, setMoreError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const activeFetch = useRef<AbortSignal | null>(null)
  const submittedQuestions = useRef(new Set<string>())
  const submitting = useRef(false)
  const settledCallback = useRef(onSettled)
  settledCallback.current = onSettled
  const descriptionId = useId()
  const inputId = useId()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    activeFetch.current = signal
    setNoticeFeed((current) => ({ items: current.items, loading: true }))
    setQuestionFeed((current) => ({ items: current.items, loading: true }))
    setLoadingMore(false)
    setMoreError('')
    void getNoticePage(0, signal).then(
      (page) => {
        if (!signal.aborted) setNoticeFeed({ ...page, loading: false })
      },
      (error: unknown) => {
        if (!signal.aborted)
          setNoticeFeed((current) => ({ ...current, loading: false, error: errorMessage(error) }))
      },
    )
    void api<{ items: SilentQuestion[] | null }>('/chat/silent-questions', { signal }).then(
      ({ items }) => {
        if (!signal.aborted) {
          setQuestionFeed({
            items: (items ?? []).filter(
              (item) => !submittedQuestions.current.has(item.question_id),
            ),
            loading: false,
          })
        }
      },
      (error: unknown) => {
        if (!signal.aborted)
          setQuestionFeed((current) => ({ ...current, loading: false, error: errorMessage(error) }))
      },
    )
    return () => controller.abort()
  }, [revision, refresh])

  async function loadMore() {
    const signal = activeFetch.current
    const offset = noticeFeed.nextOffset
    if (!signal || signal.aborted || offset === undefined || loadingMore) return
    setMoreError('')
    setLoadingMore(true)
    try {
      const page = await getNoticePage(offset, signal)
      if (signal.aborted) return
      setNoticeFeed((current) => {
        const seen = new Set(current.items.map((item) => item.id))
        return {
          items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))],
          nextOffset: page.nextOffset,
          loading: false,
        }
      })
    } catch (error) {
      if (!signal.aborted) setMoreError(errorMessage(error))
    } finally {
      if (!signal.aborted) setLoadingMore(false)
    }
  }

  async function submitAnswer(question: SilentQuestion, value: string) {
    const id = question.question_id
    if (
      submitting.current ||
      submittedQuestions.current.has(id) ||
      !value.trim() ||
      new TextEncoder().encode(value).length > 16_384
    )
      return
    submitting.current = true
    setAnswer({ id, status: 'submitting' })
    try {
      const receipt = await api<AnswerReceipt>(
        `/chat/silent-questions/${encodeURIComponent(id)}/answers`,
        {
          method: 'POST',
          body: { source_key: question.source_key, answer: value },
          timeoutMs: 480_000,
        },
      )
      submittedQuestions.current.add(id)
      setQuestionFeed((current) => ({
        ...current,
        items: current.items.filter((item) => item.question_id !== id),
      }))
      setAnswer({ id, status: 'sent', message: receipt.result?.summary?.trim() || '已提交回答。' })
    } catch (error) {
      const message =
        error instanceof ApiError
          ? errorMessage(error)
          : '未能确认回答是否已提交，请先查看更新后的待答列表。'
      setAnswer({ id, status: 'failed', message })
    } finally {
      submitting.current = false
      setRefresh((current) => current + 1)
      settledCallback.current?.()
    }
  }

  const showNotices = filter !== '提问'
  const showQuestions = filter !== '通知'
  const questionRefs = new Set([
    ...questionFeed.items.map((item) => `question:${item.question_id}`),
    ...Array.from(submittedQuestions.current, (id) => `question:${id}`),
  ])
  const notices = showNotices
    ? noticeFeed.items.filter((item) => !isQuestionNotice(item, questionRefs))
    : []
  const questions = showQuestions ? questionFeed.items : []
  const loading = (showNotices && noticeFeed.loading) || (showQuestions && questionFeed.loading)
  const hasError = (showNotices && noticeFeed.error) || (showQuestions && questionFeed.error)
  const selectedQuestion = selected?.kind === 'question' ? selected.item : undefined
  const selectedAnswer = answer && answer.id === selectedQuestion?.question_id ? answer : undefined
  const questionStillPending =
    selectedQuestion &&
    questionFeed.items.some((item) => item.question_id === selectedQuestion.question_id)
  const answering = answer?.status === 'submitting'
  const readyToAnswer =
    questionStillPending && !questionFeed.loading && !questionFeed.error && !answering
  const choices = selectedQuestion?.type !== 'TEXT_INPUT' ? (selectedQuestion?.options ?? []) : []
  const answerValue = draft.trim()
  const answerTooLong = new TextEncoder().encode(answerValue).length > 16_384

  return (
    <section className="study-module notification-preview" aria-label="通知与提问">
      <header className="module-heading">
        <h2>
          <span className="module-subtitle">通知与提问</span>
        </h2>
        <button
          type="button"
          className="text-button"
          onClick={() => setRefresh((current) => current + 1)}
        >
          刷新
        </button>
      </header>
      <p className="notification-disclaimer">
        通知仅在站内显示；回答会直接交给提出问题的助手，不进入聊天记录。
      </p>
      <div className="notification-filters" role="group" aria-label="筛选通知与提问">
        {filters.map((kind) => (
          <button
            type="button"
            key={kind}
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      {answer && !selectedAnswer && <AnswerStatus answer={answer} />}
      {showNotices && noticeFeed.error && (
        <Notice tone="error">通知加载失败：{noticeFeed.error}</Notice>
      )}
      {showQuestions && questionFeed.error && (
        <Notice tone="error">提问加载失败：{questionFeed.error}</Notice>
      )}
      {loading && (
        <p className="notification-disclaimer" role="status">
          正在加载{filter === '全部' ? '通知与提问' : filter}…
        </p>
      )}
      {!loading && !hasError && !notices.length && !questions.length && (
        <p className="notification-disclaimer" role="status">
          {showNotices && noticeFeed.nextOffset !== undefined
            ? '当前没有可显示的通知，可继续加载更早的通知。'
            : filter === '提问'
              ? '暂无待答提问。'
              : filter === '通知'
                ? '暂无通知。'
                : '暂无通知或待答提问。'}
        </p>
      )}
      <div className="notification-items">
        {questions.map((item) => (
          <button
            type="button"
            className="notification-item"
            key={`question:${item.question_id}`}
            onClick={() => {
              setDraft('')
              setSelected({ kind: 'question', item })
            }}
          >
            <span className="notification-kind">
              <MessageCircle size={16} aria-hidden="true" />
              提问
            </span>
            <span className="notification-copy">
              <strong>{questionText(item)}</strong>
              <small>静默提问 · {questionSource(item)}</small>
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
        {notices.map((item) => (
          <button
            type="button"
            className="notification-item"
            key={`notice:${item.id}`}
            onClick={() => setSelected({ kind: 'notice', item })}
          >
            <span className="notification-kind">
              <Bell size={16} aria-hidden="true" />
              通知
            </span>
            <span className="notification-copy">
              <strong>{item.input.title}</strong>
              <small>{noticeLabel(item)}</small>
            </span>
            <RecordedAt value={item.updated_at} />
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      {showNotices && moreError && <Notice tone="error">加载更多通知失败：{moreError}</Notice>}
      {showNotices && noticeFeed.nextOffset !== undefined && (
        <button
          type="button"
          className="button button-quiet"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore && <Spinner />}
          {loadingMore ? '正在加载通知…' : '加载更多通知'}
        </button>
      )}
      {selected?.kind === 'notice' && (
        <Modal
          title={selected.item.input.title}
          onClose={() => setSelected(undefined)}
          descriptionId={descriptionId}
        >
          <p className="modal-description" id={descriptionId}>
            {noticeLabel(selected.item)} <RecordedAt value={selected.item.updated_at} detailed />
          </p>
          <p
            className="notification-detail"
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {selected.item.input.body}
          </p>
        </Modal>
      )}
      {selectedQuestion && (
        <Modal
          title={`回答提问 · ${questionSource(selectedQuestion)}`}
          onClose={() => setSelected(undefined)}
          descriptionId={descriptionId}
          busy={selectedAnswer?.status === 'submitting'}
        >
          <p
            className="notification-detail"
            id={descriptionId}
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {questionText(selectedQuestion)}
          </p>
          {selectedAnswer && <AnswerStatus answer={selectedAnswer} />}
          {questionStillPending &&
            selectedAnswer?.status !== 'sent' &&
            (choices.length ? (
              <div className="modal-actions" role="group" aria-label="选择回答">
                {choices.map((option) => (
                  <button
                    className="button button-secondary"
                    type="button"
                    key={option.id}
                    disabled={!readyToAnswer}
                    style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                    onClick={() => void submitAnswer(selectedQuestion, option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="notification-detail"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (readyToAnswer && !answerTooLong)
                    void submitAnswer(selectedQuestion, answerValue)
                }}
              >
                <label htmlFor={inputId}>填写回答</label>
                <input
                  id={inputId}
                  type="text"
                  required
                  disabled={answering}
                  maxLength={16_384}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                {answerTooLong && <Notice tone="error">回答太长，请缩短后再提交。</Notice>}
                <div className="modal-actions">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={!readyToAnswer || !answerValue || answerTooLong}
                  >
                    {selectedAnswer?.status === 'submitting' && <Spinner />}
                    {selectedAnswer?.status === 'submitting' ? '正在提交…' : '提交回答'}
                  </button>
                </div>
              </form>
            ))}
          {!questionStillPending && !selectedAnswer && <Notice>此问题已不在待答列表。</Notice>}
        </Modal>
      )}
    </section>
  )
}
