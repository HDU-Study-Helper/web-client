import { test, expect, type Locator, type Page } from '@playwright/test'

async function keyboardActivate(page: Page, target: Locator) {
  for (let index = 0; index < 40; index++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press('Enter')
      return
    }
  }
  throw new Error('无法通过 Tab 到达目标操作')
}

test('初始加载不抢焦点，时钟更新和同页导航不重置焦点或播报', async ({ page }) => {
  await page.clock.install()
  await page.goto('/?demo=1')
  const announcement = page.locator('[role="status"][aria-live="polite"]').first()
  const homeHeading = page.locator('#dashboard h1')
  await expect(homeHeading).toBeVisible()
  await expect(homeHeading).not.toBeFocused()
  await expect(announcement).toBeEmpty()
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)

  const home = page.getByRole('button', { name: '主页', exact: true })
  await keyboardActivate(page, home)
  await expect(home).toBeFocused()
  await page.clock.fastForward(30_000)
  await expect(home).toBeFocused()
  await expect(announcement).toBeEmpty()
})

test('键盘切换主页、日程、我的和品牌返回时聚焦可见 h1 并礼貌播报', async ({ page }) => {
  await page.goto('/?demo=1')
  const announcement = page.locator('[role="status"][aria-live="polite"]').first()
  for (const label of ['日程', '我的', '主页']) {
    await keyboardActivate(page, page.getByRole('button', { name: label, exact: true }))
    const heading = label === '主页'
      ? page.locator('#dashboard h1')
      : page.getByRole('heading', { name: label, exact: true, level: 1 })
    await expect(heading).toHaveAttribute('tabindex', '-1')
    await expect(heading).toBeFocused()
    await expect(announcement).toHaveAttribute('aria-atomic', 'true')
    await expect(announcement).toHaveText(`已切换到${label}`)
    if (label !== '主页') {
      await expect(page.locator('#dashboard')).toBeHidden()
      await expect(page.locator('#dashboard h1')).not.toBeFocused()
    }
  }

  await keyboardActivate(page, page.getByRole('button', { name: '日程', exact: true }))
  await keyboardActivate(page, page.getByRole('button', { name: 'Academic Assistant 主页', exact: true }))
  await expect(page.locator('#dashboard h1')).toBeFocused()
  await expect(announcement).toHaveText('已切换到主页')
})

test('聊天焦点正常打开恢复，切页不被聊天延迟聚焦或关闭恢复覆盖', async ({ page }) => {
  await page.clock.install()
  await page.goto('/?demo=1')
  const launcher = page.getByRole('button', { name: '打开学习助手', exact: true })
  const input = page.getByRole('textbox', { name: '向学习助手提问' })
  await keyboardActivate(page, launcher)
  await page.clock.fastForward(750)
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await page.clock.fastForward(500)
  await expect(launcher).toBeFocused()

  await page.keyboard.press('Enter')
  await keyboardActivate(page, page.getByRole('button', { name: '日程', exact: true }))
  const scheduleHeading = page.getByRole('heading', { name: '日程', exact: true, level: 1 })
  await expect(scheduleHeading).toBeFocused()
  await page.clock.fastForward(750)
  await expect(scheduleHeading).toBeFocused()

  await page.keyboard.press('Escape')
  await keyboardActivate(page, page.getByRole('button', { name: '我的', exact: true }))
  const profileHeading = page.getByRole('heading', { name: '我的', exact: true, level: 1 })
  await page.clock.fastForward(500)
  await expect(profileHeading).toBeFocused()
  await expect(page.getByRole('region', { name: 'Academic Assistant 对话区域' })).toHaveCount(0)
  await expect(page.locator('[role="status"][aria-live="polite"]').first()).toHaveText('已切换到我的')

  await keyboardActivate(page, launcher)
  await page.clock.fastForward(750)
  await expect(input).toBeFocused()
  await page.clock.fastForward(30_000)
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await page.clock.fastForward(500)
  await expect(launcher).toBeFocused()
})
