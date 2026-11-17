import { test, expect } from '@playwright/test'

for (const width of [320, 1280]) {
  test(`${width}px单行输入及图标输入统一48px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let loggedIn = false
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/auth/me') && !loggedIn) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(path.endsWith('/auth/me') ? { id: 'input-test', username: 'student', role: 'user' } : { items: [] }) })
    })
    await page.goto('/')
    await expect(page.locator('.login-form')).toBeVisible()
    const login = await page.locator('.login-form .input-with-icon').evaluateAll(elements => elements.map(el => ({ outer: el.getBoundingClientRect().height, input: el.querySelector('input')!.getBoundingClientRect().height, font: getComputedStyle(el.querySelector('input')!).fontSize })))
    expect(login.length).toBeGreaterThan(0)
    for (const field of login) { expect(field.outer).toBe(48); expect(field.input).toBe(46); expect(field.font).toBe('16px') }
    loggedIn = true
    await page.addInitScript(() => localStorage.setItem('haa:setup:v1:input-test', JSON.stringify({ version:1, step:3, academicYear:2026, term:1, monday:'2026-09-07', completed:false, periods:[{period:1,start:'08:00',end:'08:45'}] })))
    await page.reload()
    await expect(page.locator('.period-row')).toBeVisible()
    const sizes = await page.locator('.generator-fields input, .period-row input').evaluateAll(elements => elements.map(el => ({ height: el.getBoundingClientRect().height, font: getComputedStyle(el).fontSize })))
    expect(sizes.length).toBeGreaterThan(4)
    for (const size of sizes) { expect(size.height).toBe(48); expect(size.font).toBe('16px') }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('跳过导航在三个页面都进入可见且有焦点标识的主内容', async ({ page }) => {
  await page.goto('/?demo=1')
  for (const name of ['主页', '日程', '我的']) {
    await page.getByRole('button', { name, exact:true }).click()
    const skip = page.getByRole('link', { name:'跳到主要内容' })
    await skip.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('main')).toHaveCSS('outline-style','solid')
    // A click on empty content may focus main, but must not draw a page-sized ring.
    await page.locator('.os-brand').click()
    await page.getByRole('main').dispatchEvent('pointerdown', { pointerType: 'mouse' })
    const point = await page.getByRole('main').boundingBox()
    if (!point) throw new Error('main missing')
    await page.mouse.click(point.x + 2, point.y + point.height - 2)
    await page.getByRole('main').evaluate(element => element.focus())
    await expect(page.getByRole('main')).toHaveCSS('outline-style', 'none')
  }
})
