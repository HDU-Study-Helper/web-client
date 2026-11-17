import { expect, test, type Page } from '@playwright/test'

// Same authenticated draft entry point as validation-accessibility.spec.ts.
const user = { id: 'timetable-student', username: 'student', role: 'user' }
const initialPeriods = [
  { period: 1, start: '08:00', end: '08:45' },
  { period: 2, start: '08:55', end: '09:40' },
]
type Period = typeof initialPeriods[number]
const draftKey = `haa:setup:v1:${user.id}`

async function fixture(page: Page, periods = initialPeriods) {
  await page.addInitScript(({ key, periods }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1, step: 3, academicYear: 2026, term: 1, monday: '2026-09-07',
      completed: false, periods,
    }))
  }, { key: draftKey, periods })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(path === '/auth/me' ? user : { items: [] }),
    })
  })
  await page.goto('/')
  await expect(page.locator('#add-period')).toBeVisible()
}

async function savedPeriods(page: Page): Promise<Period[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').periods, draftKey)
}

async function expectSaved(page: Page, periods: Period[]) {
  await expect.poll(() => savedPeriods(page)).toEqual(periods)
  await expect(page.locator('.period-row')).toHaveCount(periods.length)
}

const shift = (page: Page) => page.getByRole('button', { name: '从第 1 节顺延后续时间', exact: true })
const undo = (page: Page) => page.getByRole('button', { name: '撤销', exact: true })

for (const { field, value } of [
  { field: 'duration', value: '' },
  { field: 'duration', value: '-1' },
  { field: 'duration', value: '1.5' },
  { field: 'duration', value: '241' },
  { field: 'gap', value: '' },
  { field: 'gap', value: '-1' },
  { field: 'gap', value: '1.5' },
  { field: 'gap', value: '361' },
]) {
  test(`P2-19 添加拒绝 ${field}=${JSON.stringify(value)}，定位字段且不改草稿`, async ({ page }) => {
    await fixture(page)
    const input = page.locator(`#generator-${field}`)
    await input.fill(value)
    await page.getByRole('button', { name: '添加一节课', exact: true }).click()
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveAttribute('aria-describedby', `generator-${field}-error`)
    await expect(input).toBeFocused()
    await expectSaved(page, initialPeriods)
    await input.fill(field === 'duration' ? '45' : '10')
    await expect(input).not.toHaveAttribute('aria-invalid', 'true')
    await page.getByRole('button', { name: '添加一节课', exact: true }).click()
    await expectSaved(page, [...initialPeriods, { period: 3, start: '09:50', end: '10:35' }])
  })
}

test('P2-19 有课时添加只依赖时长和课间，不受生成节数或首节开始阻塞', async ({ page }) => {
  await fixture(page)
  await page.locator('#generator-count').fill('0')
  await page.locator('#generator-start').fill('')
  await page.locator('#generator-gap').fill('0')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expectSaved(page, [...initialPeriods, { period: 3, start: '09:40', end: '10:25' }])
})

test('P2-19 空表添加校验首节开始和时长，允许忽略未使用的节数及课间', async ({ page }) => {
  await fixture(page, [])
  await page.locator('#generator-start').fill('')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expect(page.locator('#generator-start')).toBeFocused()
  await expect(page.locator('#generator-start')).toHaveAttribute('aria-invalid', 'true')
  await expectSaved(page, [])
  await page.locator('#generator-start').fill('23:30')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不超出当天')
  await expectSaved(page, [])
  await page.locator('#generator-start').fill('08:00')
  await page.locator('#generator-count').fill('0')
  await page.locator('#generator-gap').fill('')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expectSaved(page, [initialPeriods[0]])
})

test('P2-19 无效末节结束及越日追加均不写入草稿', async ({ page }) => {
  await fixture(page)
  await page.locator('#period-2-end').fill('')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expectSaved(page, [initialPeriods[0], { ...initialPeriods[1], end: '' }])
  await page.locator('#period-2-end').fill('23:10')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不超出当天')
  await expectSaved(page, [initialPeriods[0], { ...initialPeriods[1], end: '23:10' }])
})

test('P2-20 顺延保留首次编辑前课间及各节时长，同一行连续编辑不覆盖基线', async ({ page }) => {
  const periods = [...initialPeriods, { period: 3, start: '10:00', end: '10:30' }]
  await fixture(page, periods)
  await page.locator('#period-1-end').fill('08:20')
  await page.locator('#period-1-end').fill('08:30')
  await shift(page).click()
  await expectSaved(page, [
    { ...periods[0], end: '08:30' },
    { period: 2, start: '08:40', end: '09:25' },
    { period: 3, start: '09:45', end: '10:15' },
  ])
  // A successful shift establishes the next edit's baseline.
  await page.locator('#period-1-end').fill('08:40')
  await shift(page).click()
  await expectSaved(page, [
    { ...periods[0], end: '08:40' },
    { period: 2, start: '08:50', end: '09:35' },
    { period: 3, start: '09:55', end: '10:25' },
  ])
})

test('P2-20 普通未编辑顺延不改数据，生成参数不会修补或污染原课间', async ({ page }) => {
  await fixture(page)
  await page.locator('#generator-gap').fill('')
  await page.locator('#generator-duration').fill('')
  await shift(page).click()
  await expectSaved(page, initialPeriods)
  await page.locator('#period-1-end').fill('08:30')
  await shift(page).click()
  await expectSaved(page, [
    { ...initialPeriods[0], end: '08:30' },
    { period: 2, start: '08:40', end: '09:25' },
  ])
})

test('P2-20 顺延拒绝无效原时间，不以 NaN 覆盖后续课时', async ({ page }) => {
  await fixture(page)
  await page.locator('#period-2-start').fill('')
  await page.locator('#generator-gap').fill('')
  await page.locator('#period-1-end').fill('08:30')
  await shift(page).click()
  await expect(page.getByRole('alert')).toContainText('原作息时间无效')
  await expectSaved(page, [
    { ...initialPeriods[0], end: '08:30' },
    { ...initialPeriods[1], start: '' },
  ])
  await expect(page.locator('#period-2-end')).toHaveValue('09:40')
})

test('P2-20 顺延失败不写部分结果，保留基线供修正后重试', async ({ page }) => {
  const periods = [...initialPeriods, { period: 3, start: '09:50', end: '10:35' }]
  await fixture(page, periods)
  // The second row fits (23:10–23:55), but the third would cross midnight.
  await page.locator('#period-1-end').fill('23:00')
  await shift(page).click()
  await expect(page.getByRole('alert')).toContainText('超出当天')
  await expectSaved(page, [{ ...periods[0], end: '23:00' }, ...periods.slice(1)])
  await page.locator('#period-1-end').fill('')
  await shift(page).click()
  await expect(page.getByRole('alert')).toContainText('有效的开始和结束时间')
  await expectSaved(page, [{ ...periods[0], end: '' }, ...periods.slice(1)])
  await page.locator('#period-1-end').fill('08:30')
  await shift(page).click()
  await expectSaved(page, [
    { ...periods[0], end: '08:30' },
    { period: 2, start: '08:40', end: '09:25' },
    { period: 3, start: '09:35', end: '10:20' },
  ])
})

test('P2-20 添加、删除和撤销后不复用旧结构的编辑基线', async ({ page }) => {
  await fixture(page)
  await page.locator('#period-1-end').fill('08:30')
  await page.getByRole('button', { name: '添加一节课', exact: true }).click()
  const added = [...initialPeriods.map((period, i) => i ? period : { ...period, end: '08:30' }),
    { period: 3, start: '09:50', end: '10:35' }]
  await shift(page).click()
  await expectSaved(page, added)
  await page.locator('#period-1-end').fill('08:25')
  await page.getByRole('button', { name: '删除第 3 节', exact: true }).click()
  await shift(page).click()
  await expectSaved(page, [{ ...initialPeriods[0], end: '08:25' }, initialPeriods[1]])
  await page.locator('#period-1-end').fill('08:20')
  await undo(page).click()
  await shift(page).click()
  await expectSaved(page, [{ ...added[0], end: '08:20' }, ...added.slice(1)])
})

test('P2-23 生成替换清除旧撤销和计时器，新删除仍保留完整八秒撤销', async ({ page }) => {
  await fixture(page)
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: '删除第 2 节', exact: true }).click()
  await page.clock.fastForward(4000)
  await page.locator('#generator-count').fill('2')
  await page.locator('#generator-start').fill('10:00')
  await page.getByRole('button', { name: '生成时间表', exact: true }).click()
  await page.getByRole('button', { name: '确认替换', exact: true }).click()
  const generated = [
    { period: 1, start: '10:00', end: '10:45' },
    { period: 2, start: '10:55', end: '11:40' },
  ]
  await expect(undo(page)).toHaveCount(0)
  await expectSaved(page, generated)
  await page.getByRole('button', { name: '删除第 2 节', exact: true }).click()
  await page.clock.fastForward(4100)
  await expect(undo(page)).toBeVisible()
  await undo(page).press('Enter')
  await expectSaved(page, generated)
  await page.getByRole('button', { name: '删除第 2 节', exact: true }).click()
  await page.clock.fastForward(7900)
  await expect(undo(page)).toBeVisible()
  await page.clock.fastForward(101)
  await expect(undo(page)).toHaveCount(0)
  await expect(page.locator('#add-period')).toBeFocused()
})

test('P2-23 替换校验失败保留原表与撤销，成功后清理编辑基线', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: '删除第 2 节', exact: true }).click()
  await page.locator('#generator-count').fill('0')
  await page.getByRole('button', { name: '生成时间表', exact: true }).click()
  await page.getByRole('button', { name: '确认替换', exact: true }).click()
  await expect(undo(page)).toBeVisible()
  await undo(page).click()
  await expectSaved(page, initialPeriods)
  await page.locator('#period-1-end').fill('08:30')
  await page.locator('#generator-count').fill('2')
  await page.locator('#generator-start').fill('10:00')
  await page.getByRole('button', { name: '确认替换', exact: true }).click()
  await shift(page).click()
  await expectSaved(page, [
    { period: 1, start: '10:00', end: '10:45' },
    { period: 2, start: '10:55', end: '11:40' },
  ])
})

for (const length of [1, 2]) {
  test(`P2-22 键盘删除${length === 1 ? '唯一' : '最后'}一行聚焦撤销，撤销聚焦恢复行`, async ({ page }) => {
    const periods = initialPeriods.slice(0, length)
    await fixture(page, periods)
    const remove = page.getByRole('button', { name: `删除第 ${length} 节`, exact: true })
    await remove.focus()
    await remove.press('Enter')
    await expect(undo(page)).toBeFocused()
    await undo(page).press('Enter')
    await expect(page.locator(`#period-${length}-start`)).toBeFocused()
    await expectSaved(page, periods)
  })
}

test('P2-22 键盘取消生成返回触发按钮，替换成功聚焦新表第一行', async ({ page }) => {
  await fixture(page)
  const generate = page.getByRole('button', { name: '生成时间表', exact: true })
  await generate.focus()
  await generate.press('Enter')
  const cancel = page.getByRole('button', { name: '取消', exact: true })
  await cancel.focus()
  await cancel.press('Enter')
  await expect(generate).toBeFocused()
  await page.locator('#generator-count').fill('1')
  await page.locator('#generator-start').fill('11:00')
  await generate.press('Enter')
  const confirm = page.getByRole('button', { name: '确认替换', exact: true })
  await confirm.focus()
  await confirm.press('Enter')
  await expect(page.locator('#period-1-start')).toBeFocused()
  await expectSaved(page, [{ period: 1, start: '11:00', end: '11:45' }])
})
