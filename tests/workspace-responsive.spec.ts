import { test, expect, type Locator, type Page } from '@playwright/test'

async function expectReadable(locator: Locator) {
  for (const item of await locator.all()) {
    await expect(item).toBeVisible()
    const metrics = await item.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        fontSize: Number.parseFloat(style.fontSize),
        clipped:
          ['hidden', 'clip'].includes(style.overflowX) &&
          element.scrollWidth > element.clientWidth + 1,
      }
    })
    expect(metrics.fontSize).toBeGreaterThanOrEqual(12)
    expect(metrics.clipped).toBe(false)
  }
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > innerWidth,
    dashboard: (() => {
      const dashboard = document.querySelector('#dashboard')!
      return dashboard.scrollWidth > dashboard.clientWidth + 1
    })(),
  }))
  expect(overflow).toEqual({ document: false, dashboard: false })
}

for (const width of [761, 768, 820, 900, 1000, 1024, 1100]) {
  test(`${width}px：示例安排与简报单列，课程任务、图标和标题完整可读`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/?demo=1')
    const middle = page.locator('.dashboard-middle')
    const cards = await middle.evaluate((element) => {
      const parent = element.getBoundingClientRect()
      return {
        x: parent.x,
        width: parent.width,
        children: Array.from(element.children).map((child) => {
          const rect = child.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom }
        }),
      }
    })
    expect(cards.children).toHaveLength(2)
    for (const card of cards.children) {
      expect(card.x).toBeCloseTo(cards.x, 0)
      expect(card.width).toBeCloseTo(cards.width, 0)
    }
    expect(cards.children[1].y).toBeGreaterThanOrEqual(cards.children[0].bottom)
    await expectReadable(page.locator('.module-heading .pixel-type, .module-subtitle'))
    await expectReadable(page.locator('.stat > div > span, .course-table-head > span'))
    await expectReadable(page.locator('.course-task, .course-task small, .progress-cell b'))
    await expect(page.locator('.stat-icon')).toHaveCount(3)
    for (const icon of await page.locator('.stat-icon').all()) {
      await expect(icon).toBeVisible()
      expect((await icon.boundingBox())!.width).toBeGreaterThan(0)
    }
    await expect(page.getByRole('progressbar', { name: '高等数学学习进度' })).toBeVisible()
    const math = page.getByRole('button', { name: '查看高等数学详情', exact: true })
    await expect(math).toHaveAccessibleDescription(/65%.*例题整理.*示例截止.*2026-11-15/)
    await page.getByRole('button', { name: '查看全部 5 门课程' }).click()
    await expect(page.locator('.course-task')).toHaveCount(5)
    await expectReadable(page.locator('.course-task, .no-task'))
    await expectNoOverflow(page)
    await math.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toContainText('示例截止日期')
    await expect(page.getByRole('dialog')).toContainText('2026-11-15')
  })
}

for (const width of [320, 390, 760]) {
  test(`${width}px：手机展示课程任务与进度，三个页面保持全宽`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?demo=1')
    await expectReadable(page.locator('.course-task, .course-task small, .progress-cell b'))
    await expectReadable(page.locator('.module-heading .pixel-type, .module-subtitle'))
    for (const navigation of ['主页', '日程', '我的']) {
      await page.getByRole('button', { name: navigation, exact: true }).click()
      const bounds = await page.locator('.workspace-main').evaluate((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          x: rect.x + Number.parseFloat(style.paddingLeft),
          width:
            rect.width -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight),
        }
      })
      const content = page.locator(navigation === '主页' ? '#dashboard' : '.standalone-page')
      const box = (await content.boundingBox())!
      expect(box.x).toBeCloseTo(bounds.x, 0)
      expect(box.width).toBeCloseTo(bounds.width, 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.getByRole('button', { name: '打开学习助手' }).click()
    const panel = (await page.locator('.chat-window').boundingBox())!
    expect(panel.x).toBe(0)
    expect(Math.round(panel.width)).toBe(width)
  })
}

for (const timezoneId of ['Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test(`${timezoneId}：跨北京时间午夜后示例快照不变，真实时钟独立更新`, async ({ browser }) => {
    const context = await browser.newContext({
      timezoneId,
      locale: 'zh-CN',
      viewport: { width: 1024, height: 900 },
    })
    try {
      const page = await context.newPage()
      await page.clock.install({ time: new Date('2027-01-01T15:59:00.000Z') })
      await page.goto('/?demo=1')
      const clock = page.locator('.welcome-datetime')
      await expect(clock).toContainText('2027年1月1日')
      await expect(clock.locator('time')).toHaveText('23:59')
      await expect(clock).toContainText('北京时间')
      await expect(page.locator('.workspace-meta')).toContainText('示例快照 · 2026-11-12')
      await expect(page.locator('.today-module')).toContainText('示例安排')
      await expect(page.locator('.today-module')).not.toContainText('今日')
      const before = await page
        .locator('.overview-module, .dashboard-middle, .courses-module')
        .allTextContents()
      await page.clock.fastForward(120_000)
      await expect(clock).toContainText('2027年1月2日')
      await expect(clock.locator('time')).toHaveText('00:01')
      expect(
        await page
          .locator('.overview-module, .dashboard-middle, .courses-module')
          .allTextContents(),
      ).toEqual(before)
      await expect(page.locator('.course-task time').first()).toHaveAttribute(
        'datetime',
        '2026-11-15',
      )
      await expect(page.locator('.schedule-list time').first()).toHaveAttribute(
        'datetime',
        '2026-11-12T09:00:00+08:00',
      )
      await page.getByRole('button', { name: '日程', exact: true }).click()
      await expect(page.locator('.local-page-badge')).toContainText('2026-11-12')
      await expect(page.getByRole('button', { name: /示例 2026 年 11\.12/ })).toBeVisible()
      await page.getByRole('button', { name: '打开学习助手' }).click()
      await page.clock.fastForward(1000)
      const input = page.getByRole('textbox', { name: '向学习助手提问' })
      for (const question of [
        '有哪些作业？',
        '学习进度怎么样？',
        '总结高等数学重点',
        '安排学习计划',
        '你好',
      ]) {
        await input.fill(question)
        await page.getByRole('button', { name: '发送消息' }).click()
        await page.clock.fastForward(1000)
        const reply = page.locator('.message-assistant').last()
        await expect(reply).toContainText('2026-11-12')
        await expect(reply.locator('.message-sources')).toContainText(/2026-11-12 示例/)
        await expect(reply.locator('.message-sources')).not.toContainText('今日安排')
      }
      await expect(page.getByRole('log')).toContainText('示例截止日期：2026-11-14')
      await expect(page.getByRole('log')).toContainText('示例 2026-11-13 周五')
    } finally {
      await context.close()
    }
  })
}
