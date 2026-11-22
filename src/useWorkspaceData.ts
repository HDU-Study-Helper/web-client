import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from './api'

const zone = 'Asia/Shanghai'
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: zone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
export const dateKey = (value: Date | string) => dayFormat.format(new Date(value))
export const scheduleTime = (value: string) => timeFormat.format(new Date(value))
export const localDateTime = (value: string) => dateTimeFormat.format(new Date(value))
export function addDay(key: string, days: number) {
  return new Date(Date.parse(key + 'T00:00:00Z') + 86_400_000 * days).toISOString().slice(0, 10)
}
export const dateLabel = (key: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(key + 'T00:00:00+08:00'))

export type ScheduleEntry = {
  id: string
  title: string
  details: string
  source: 'TIMETABLE' | 'USER' | 'AGENT'
  start_time: string
  end_time: string
  time_status: string
  event_status: string
  academic_year: number
  term: number
  teaching_week: number
}
export type Offering = {
  offering_id: string
  name: string
  source: string
  teacher?: string
  description?: string
  observed_at: string
}
export type AcademicItem = {
  item_id: string
  title: string
  kind: string
  status: string
  text?: string
  deadline?: { value?: string; date?: string; raw?: string }
  observed_at?: string
}
export type PublicTodo = {
  id: string
  status: 'open' | 'complete'
  input: { title: string; body?: string; due_at?: string }
}
export type Resource<T> = {
  data: T | undefined
  error?: string
  loading: boolean
  reload: () => void
}

type Page<T> = { items: T[]; next_offset?: number; limit?: number }
async function allPages<T>(base: string, signal: AbortSignal, maxPages = 20) {
  const items: T[] = []
  let offset = 0
  // Keep each HTTP response bounded; none of these screens needs /academic/tree.
  for (let page = 0; page < maxPages; page++) {
    const response = await api<Page<T>>(
      base + (base.includes('?') ? '&' : '?') + `limit=50&offset=${offset}`,
      { signal },
    )
    items.push(...response.items)
    if (response.items.length < 50) return items
    const next = response.next_offset ?? offset + response.items.length
    if (next <= offset) throw new Error('列表分页未推进，请刷新后重试。')
    offset = next
  }
  throw new Error('列表超过当前页面的加载范围。')
}

function useResource<T>(
  path: string | undefined,
  revision: number,
  fetchAll: boolean | 'trackedOfferings',
): Resource<T[]> {
  const [state, setState] = useState<{
    path?: string
    data?: T[]
    error?: string
    loading: boolean
  }>({ loading: false })
  const [retry, setRetry] = useState(0)
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setState((old) => ({
      path,
      data: old.path === path && fetchAll !== 'trackedOfferings' ? old.data : undefined,
      loading: true,
    }))
    const signal = controller.signal
    const load =
      fetchAll === 'trackedOfferings'
        ? Promise.all([
            allPages<T & Pick<Offering, 'offering_id'>>(path, signal),
            api<{ excluded: Array<{ offering_id: string }> }>('/academic/collection-policy', {
              signal,
            }),
          ])
            .then(([items, policy]) => {
              const excluded = new Set(policy.excluded.map((course) => course.offering_id))
              return items.filter((course) => !excluded.has(course.offering_id))
            })
            .catch(() => {
              throw new Error('无法加载课程列表或停采设置，请重试。')
            })
        : fetchAll
          ? allPages<T>(path, signal)
          : api<Page<T>>(path, { signal }).then((result) => result.items)
    void load
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, data, loading: false })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ path, error: errorMessage(error), loading: false })
      })
    return () => controller.abort()
  }, [path, revision, retry, fetchAll])
  return state.path === path
    ? { data: state.data, error: state.error, loading: state.loading, reload }
    : { data: undefined, loading: Boolean(path), reload }
}

export function useWorkspaceData(enabled: boolean, today: string, revision: number) {
  const query = new URLSearchParams({
    from: today + 'T00:00:00+08:00',
    to: addDay(today, 4) + 'T00:00:00+08:00',
  })
  const schedules = useResource<ScheduleEntry>(
    enabled ? `/schedules?${query}` : undefined,
    revision,
    true,
  )
  const todos = useResource<PublicTodo>(enabled ? '/chat/todos' : undefined, revision, true)
  const offerings = useResource<Offering>(
    enabled ? '/academic/offerings' : undefined,
    revision,
    'trackedOfferings',
  )
  return { schedules, todos, offerings }
}

export function useOfferingItems(offering: Offering | undefined, offset: number) {
  const path = offering
    ? '/academic/items?' +
      new URLSearchParams({
        offering_id: offering.offering_id,
        limit: '12',
        offset: String(offset),
      })
    : undefined
  return useResource<AcademicItem>(path, 0, false)
}

export function schedulesOn(schedules: ScheduleEntry[] | undefined, day: string) {
  const start = Date.parse(day + 'T00:00:00+08:00')
  return (schedules || []).filter(
    (item) => Date.parse(item.start_time) < start + 86_400_000 && Date.parse(item.end_time) > start,
  )
}

const platforms: Record<string, string> = {
  chaoxing: '学习通',
  mooc: '中国大学 MOOC',
  jwxt: '教务',
  ucampus: 'U 校园',
}
export const platformLabel = (source: string) => platforms[source] || source
