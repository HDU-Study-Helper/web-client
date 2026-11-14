import type { Period, SetupDraft } from './types'

export function newDraft(): SetupDraft {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return {
    version: 1,
    step: 0,
    academicYear: month >= 8 ? year : year - 1,
    term: month >= 2 && month < 8 ? 2 : 1,
    monday: '',
    periods: [],
    completed: false,
  }
}
const key = (userID: string) => `haa:setup:v1:${userID}`
export function loadDraft(userID: string): SetupDraft {
  const fallback = newDraft()
  try {
    const data = JSON.parse(localStorage.getItem(key(userID)) || 'null')
    if (!data || data.version !== 1) return fallback
    return {
      ...fallback,
      step: Number.isInteger(data.step) && data.step >= 0 && data.step <= 3 ? data.step : 0,
      academicYear:
        Number.isInteger(data.academicYear) &&
        data.academicYear >= 2000 &&
        data.academicYear <= 2100
          ? data.academicYear
          : fallback.academicYear,
      term: [1, 2].includes(data.term) ? data.term : fallback.term,
      monday:
        typeof data.monday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.monday)
          ? data.monday
          : '',
      periods:
        Array.isArray(data.periods) && data.periods.length <= 30
          ? data.periods.filter(
              (p: Period) =>
                p &&
                Number.isInteger(p.period) &&
                typeof p.start === 'string' &&
                typeof p.end === 'string',
            )
          : [],
      completed: data.completed === true,
      importResult:
        data.importResult && typeof data.importResult.generated === 'number'
          ? data.importResult
          : undefined,
    }
  } catch {
    return fallback
  }
}
export function saveDraft(userID: string, draft: SetupDraft): boolean {
  try {
    localStorage.setItem(key(userID), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export const toMinutes = (value: string) =>
  /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : NaN
export const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export function validateTerm(draft: SetupDraft): string | undefined {
  if (
    !Number.isInteger(draft.academicYear) ||
    draft.academicYear < 2000 ||
    draft.academicYear > 2100 ||
    ![1, 2].includes(draft.term)
  )
    return '请填写有效的学年和学期。'
  const date = new Date(`${draft.monday}T00:00:00+08:00`)
  if (!draft.monday || !Number.isFinite(date.getTime())) return '请选择第一教学周的周一日期。'
  const local = new Date(date.getTime() + 8 * 3600_000)
  if (local.toISOString().slice(0, 10) !== draft.monday) return '请选择有效的日期。'
  if (local.getUTCDay() !== 1) return '第一教学周必须从周一开始，请重新选择日期。'
  if (![draft.academicYear, draft.academicYear + 1].includes(local.getUTCFullYear()))
    return '开学日期应在所选学年范围内。'
}

export function validatePeriods(periods: Period[]): string | undefined {
  if (!periods.length || periods.length > 30) return '请设置 1–30 节课的作息时间。'
  let previous = -1
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i],
      start = toMinutes(p.start),
      end = toMinutes(p.end)
    if (p.period !== i + 1 || !Number.isFinite(start) || !Number.isFinite(end) || start >= end)
      return `请检查第 ${i + 1} 节课的开始和结束时间。`
    if (start < previous) return `第 ${i + 1} 节课与上一节课时间重叠，请调整。`
    previous = end
  }
}

export function generatePeriods(
  count: number,
  start: string,
  duration: number,
  gap: number,
): Period[] {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 30 ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 240 ||
    !Number.isInteger(gap) ||
    gap < 0 ||
    gap > 360 ||
    !Number.isFinite(toMinutes(start))
  )
    throw new Error('请检查节数、开始时间、每节时长和课间休息。')
  let minute = toMinutes(start)
  return Array.from({ length: count }, (_, i) => {
    const end = minute + duration
    if (end >= 1440) throw new Error('生成的时间超出当天，请减少节数或调整间隔。')
    const period = { period: i + 1, start: toTime(minute), end: toTime(end) }
    minute = end + gap
    return period
  })
}
