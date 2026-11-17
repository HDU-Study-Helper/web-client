import { expect, test, type Page } from '@playwright/test'

const user = { id: 'validation-student', username: 'student', role: 'user' }
const draft = {
  version: 1, step: 3, academicYear: 2026, term: 1, monday: '2026-09-07', completed: false,
  periods: [
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:55', end: '09:40' },
  ],
}

async function fixture(page: Page, value = draft) {
  await page.addInitScript(({ user, value }) => {
    localStorage.setItem(`haa:setup:v1:${user.id}`, JSON.stringify(value))
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (options) {
      this.setAttribute('data-scrolled-to', 'true')
      original.call(this, options)
    }
  }, { user, value })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const data = path === '/auth/me' ? user : { items: [] }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('/')
}

async function expectInlineError(page: Page, id: string) {
  const field = page.locator(`#${id}`)
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAttribute('aria-describedby', `${id}-error`)
  await expect(page.locator(`#${id}-error`)).toBeVisible()
}

test('学期日期提交后定位首错，摘要链接可跳转，修正即时清除', async ({ page }) => {
  await fixture(page, { ...draft, step: 2, monday: '2026-09-08' })
  const date = page.locator('#monday')
  await expect(date).not.toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expectInlineError(page, 'monday')
  await expect(date).toBeFocused()
  await expect(date).toHaveAttribute('data-scrolled-to', 'true')
  const summary = page.getByRole('alert', { name: '请检查以下字段' })
  await summary.getByRole('link', { name: /必须从周一开始/ }).click()
  await expect(date).toBeFocused()
  await date.fill('2025-09-01')
  await expect(page.locator('#monday-error')).toContainText('所选学年范围')
  await date.fill('2026-09-07')
  await expect(date).not.toHaveAttribute('aria-invalid', 'true')
  await expect(date).not.toHaveAttribute('aria-describedby', /.+/)
  await expect(summary).toHaveCount(0)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.locator('#period-1-start')).toBeVisible()
})

test('重叠标记对应行开始，结束不晚于开始标记结束，修正后移除错误', async ({ page }) => {
  await fixture(page)
  await page.locator('#period-2-start').fill('08:30')
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: '保存并完成设置' }).click()
  await expectInlineError(page, 'period-2-start')
  await expect(page.locator('#period-2-start')).toBeFocused()
  await expect(page.locator('#period-2-end')).not.toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('alert', { name: '请检查以下字段' }).getByRole('link').click()
  await expect(page.locator('#period-2-start')).toBeFocused()
  await page.locator('#period-2-start').fill('08:55')
  await expect(page.locator('#period-2-start-error')).toHaveCount(0)
  await page.locator('#period-2-end').fill('08:55')
  await page.getByRole('button', { name: '保存并完成设置' }).click()
  await expectInlineError(page, 'period-2-end')
  await expect(page.locator('#period-2-end')).toBeFocused()
  await page.locator('#period-2-end').fill('09:40')
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expect(page.getByRole('alert', { name: '请检查以下字段' })).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('haa:setup:v1:validation-student') || '{}'))
  expect(saved.periods[1]).toEqual({ period: 2, start: '08:55', end: '09:40' })
})

test('空时间标记对应 input，生成器非法参数可定位并即时清除', async ({ page }) => {
  await fixture(page)
  await page.locator('#period-1-end').fill('')
  await page.getByRole('button', { name: '保存并完成设置' }).click()
  await expectInlineError(page, 'period-1-end')
  await expect(page.locator('#period-1-end')).toBeFocused()
  await page.locator('#period-1-end').fill('08:45')
  await expect(page.locator('#period-1-end-error')).toHaveCount(0)
  await page.locator('#generator-count').fill('0')
  await page.getByRole('button', { name: '生成时间表' }).click()
  await page.getByRole('button', { name: '确认替换' }).click()
  await expectInlineError(page, 'generator-count')
  await expect(page.locator('#generator-count')).toBeFocused()
  await page.locator('#generator-count').fill('2')
  await expect(page.locator('#generator-count-error')).toHaveCount(0)
  await expect(page.getByRole('alert', { name: '请检查生成参数' })).toHaveCount(0)
})
