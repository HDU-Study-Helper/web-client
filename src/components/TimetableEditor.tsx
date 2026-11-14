import { useState } from 'react'
import { Clock3, Plus, RotateCw, Trash2, WandSparkles } from 'lucide-react'
import type { Period } from '../types'
import { generatePeriods, toMinutes, toTime } from '../setup'
import { Notice } from './UI'

export default function TimetableEditor({
  periods,
  onChange,
  disabled,
}: {
  periods: Period[]
  onChange: (periods: Period[]) => void
  disabled: boolean
}) {
  const [count, setCount] = useState(periods.length || 12)
  const [start, setStart] = useState(periods[0]?.start || '08:00')
  const [duration, setDuration] = useState(45)
  const [gap, setGap] = useState(10)
  const [error, setError] = useState('')
  const [replace, setReplace] = useState(false)
  function generate() {
    setError('')
    try {
      onChange(generatePeriods(count, start, duration, gap))
      setReplace(false)
    } catch (error) {
      setError((error as Error).message)
    }
  }
  function edit(index: number, field: 'start' | 'end', value: string) {
    onChange(periods.map((period, i) => (i === index ? { ...period, [field]: value } : period)))
  }
  function shiftAfter(index: number) {
    setError('')
    try {
      const next = periods.map((period) => ({ ...period }))
      let minute = toMinutes(next[index].end)
      if (!Number.isFinite(minute)) throw new Error('请先填写有效的结束时间。')
      for (let i = index + 1; i < next.length; i++) {
        const oldDuration = toMinutes(periods[i].end) - toMinutes(periods[i].start)
        const oldGap = toMinutes(periods[i].start) - toMinutes(periods[i - 1].end)
        const start = minute + Math.max(0, Number.isFinite(oldGap) ? oldGap : gap)
        const end = start + (oldDuration > 0 ? oldDuration : duration)
        if (end >= 1440) throw new Error('顺延后超出当天，请调整时间。')
        next[i] = { ...next[i], start: toTime(start), end: toTime(end) }
        minute = end
      }
      onChange(next)
    } catch (error) {
      setError((error as Error).message)
    }
  }
  function add() {
    setError('')
    const minute = periods.length ? toMinutes(periods.at(-1)!.end) + gap : toMinutes(start)
    if (!Number.isFinite(minute) || minute + duration >= 1440) {
      setError('无法继续添加，请先检查最后一节的结束时间。')
      return
    }
    onChange([
      ...periods,
      { period: periods.length + 1, start: toTime(minute), end: toTime(minute + duration) },
    ])
  }
  return (
    <div className="timetable-editor">
      <div className="generator-card">
        <div className="card-small-heading">
          <WandSparkles size={18} />
          <strong>快速生成作息</strong>
          <span>生成后可逐节调整</span>
        </div>
        <fieldset className="generator-fields" disabled={disabled}>
          <label>
            每天节数
            <div className="number-unit">
              <input
                type="number"
                min={1}
                max={30}
                value={count || ''}
                onChange={(event) => setCount(Number(event.target.value))}
              />
              <span>节</span>
            </div>
          </label>
          <label>
            首节开始
            <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            每节时长
            <div className="number-unit">
              <input
                type="number"
                min={1}
                max={240}
                value={duration || ''}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
              <span>分钟</span>
            </div>
          </label>
          <label>
            课间休息
            <div className="number-unit">
              <input
                type="number"
                min={0}
                max={360}
                value={Number.isNaN(gap) ? '' : gap}
                onChange={(event) => setGap(Number(event.target.value))}
              />
              <span>分钟</span>
            </div>
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => (periods.length ? setReplace(true) : generate())}
          >
            <WandSparkles size={16} />
            生成时间表
          </button>
        </fieldset>
        {replace && (
          <div className="replace-confirm" role="alert">
            重新生成会替换下方的全部时间。
            <button className="text-button" onClick={generate} disabled={disabled}>
              确认替换
            </button>
            <button className="text-button" onClick={() => setReplace(false)} disabled={disabled}>
              取消
            </button>
          </div>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="periods-heading">
        <h3>
          <Clock3 size={17} />
          每日节次
        </h3>
        <span>{periods.length} 节 · 北京时间</span>
      </div>
      {periods.length > 0 ? (
        <div className="periods-table">
          <div className="periods-table-header">
            <span>节次</span>
            <span>开始时间</span>
            <span>结束时间</span>
            <span>调整</span>
          </div>
          {periods.map((period, index) => (
            <div className="period-row" key={period.period}>
              <span className="period-number">
                <span>{String(period.period).padStart(2, '0')}</span>第 {period.period} 节
              </span>
              <input
                aria-label={`第 ${period.period} 节开始时间`}
                type="time"
                value={period.start}
                disabled={disabled}
                onChange={(event) => edit(index, 'start', event.target.value)}
              />
              <input
                aria-label={`第 ${period.period} 节结束时间`}
                type="time"
                value={period.end}
                disabled={disabled}
                onChange={(event) => edit(index, 'end', event.target.value)}
              />
              <span className="period-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`从第 ${period.period} 节顺延后续时间`}
                  title="保持课间与课时长度，顺延后续时间"
                  onClick={() => shiftAfter(index)}
                  disabled={disabled || index === periods.length - 1}
                >
                  <RotateCw size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除第 ${period.period} 节`}
                  onClick={() =>
                    onChange(
                      periods
                        .filter((_, i) => i !== index)
                        .map((p, i) => ({ ...p, period: i + 1 })),
                    )
                  }
                  disabled={disabled}
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-periods">
          <Clock3 size={28} />
          <strong>从第一节课开始，排好一天</strong>
          <p>使用上方工具生成，或逐节添加你的实际作息。</p>
        </div>
      )}
      <button
        type="button"
        className="add-period"
        disabled={disabled || periods.length >= 30}
        onClick={add}
      >
        <Plus size={16} />
        添加一节课
      </button>
      <p className="field-hint">
        请按学校实际作息核对。午休、晚休可直接通过调整下一节的开始时间设置。
      </p>
    </div>
  )
}
