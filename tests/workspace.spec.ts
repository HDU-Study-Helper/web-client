import { test, expect, type Locator } from '@playwright/test'

async function expectFontSize(locator: Locator, minimum = 12) {
  const size = await locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(size).toBeGreaterThanOrEqual(minimum)
}

async function expectTextContrast(locator: Locator, minimum = 4.5) {
  const ratio = await locator.evaluate((element) => {
    const channels = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? []
    const luminance = (value: string) => {
      const rgb = channels(value).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    }
    const foreground = getComputedStyle(element).color
    let current: Element | null = element
    let background = 'rgb(255, 255, 255)'
    while (current) {
      const candidate = getComputedStyle(current).backgroundColor
      if (!candidate.endsWith(', 0)') && candidate !== 'transparent') {
        background = candidate
        break
      }
      current = current.parentElement
    }
    const light = Math.max(luminance(foreground), luminance(background))
    const dark = Math.min(luminance(foreground), luminance(background))
    return (light + 0.05) / (dark + 0.05)
  })
  expect(ratio).toBeGreaterThanOrEqual(minimum)
}

test('本地预览不请求 API，悬浮助手可打开、拖动并保留消息', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => {
    if (/\/api\/|\/admin/.test(request.url())) requests.push(request.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?demo=1')

  const dashboard = page.locator('#dashboard')
  const launcher = page.locator('.assistant-launcher')
  await expect(dashboard).toBeVisible()
  await expect(launcher).toBeVisible()
  await expect(page.locator('.os-header time')).toHaveCount(0)
  const homeTime = page.locator('.welcome-datetime time')
  await expect(homeTime).toBeVisible()
  await expect(homeTime).toHaveText(/^\d{2}:\d{2}$/)
  await expectTextContrast(homeTime)
  await expectTextContrast(page.locator('.schedule-list time').first())
  await expectTextContrast(page.locator('.course-task small').first())
  await expectTextContrast(page.locator('.all-courses'))
  await expectFontSize(page.locator('.schedule-list time').first())
  await expectFontSize(page.locator('.course-task small').first())
  await expectFontSize(page.locator('.all-courses'))
  await expect(page.getByText('A NEW DAY, A LITTLE PROGRESS.')).toHaveCount(0)
  await expect(page.getByText('PERSONAL ACADEMIC WORKSTATION')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Academic Assistant 对话区域' })).toHaveCount(0)

  const launcherBeforeDrag = (await launcher.boundingBox())!
  await launcher.hover({ position: { x: 28, y: 28 } })
  await page.mouse.down()
  await page.mouse.move(launcherBeforeDrag.x - 180, launcherBeforeDrag.y - 110, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('region', { name: 'Academic Assistant 对话区域' })).toHaveCount(0)
  const launcherAfterDrag = (await launcher.boundingBox())!
  expect(launcherAfterDrag.x).toBeLessThan(launcherBeforeDrag.x)
  expect(launcherAfterDrag.y).toBeLessThan(launcherBeforeDrag.y)

  await launcher.click()
  const assistant = page.getByRole('region', { name: 'Academic Assistant 对话区域' })
  const input = page.getByRole('textbox', { name: '向学习助手提问' })
  const morph = page.locator('.chat-morph-shell')
  await expect(morph).toBeVisible()
  const launcherBox = (await launcher.boundingBox())!
  await expect(morph).toHaveCount(0)
  await expect(assistant).toBeVisible()
  await expect(input).toBeFocused()
  const panelBox = (await assistant.boundingBox())!
  expect(panelBox.x + panelBox.width).toBeCloseTo(launcherBox.x + launcherBox.width, 0)
  expect(panelBox.y + panelBox.height).toBeCloseTo(launcherBox.y + launcherBox.height, 0)
  await expect(morph).toHaveCount(0)

  const before = (await assistant.boundingBox())!
  const handle = assistant.locator('.chat-window-handle')
  await handle.hover({ position: { x: 100, y: 20 } })
  await page.mouse.down()
  await page.mouse.move(before.x - 140, before.y - 80, { steps: 6 })
  await page.mouse.up()
  const after = (await assistant.boundingBox())!
  expect(after.x).toBeLessThan(before.x)
  expect(after.y).toBeLessThan(before.y)
  expect(after.x).toBeGreaterThanOrEqual(0)
  expect(after.y).toBeGreaterThanOrEqual(0)
  const movedAnchor = { x: after.x + after.width, y: after.y + after.height }

  await page.getByRole('button', { name: '这周有哪些作业要交？' }).click()
  await expect(page.getByRole('log')).toContainText('我这周有哪些作业和截止日期？')
  await expect(page.getByRole('log')).toContainText('你有 3 项待完成任务')
  await page.locator('.workspace-meta').click({ position: { x: 20, y: 20 } })
  await expect(assistant).toHaveCount(0)
  await expect(launcher).toBeFocused()
  const launcherAfterClose = (await launcher.boundingBox())!
  expect(launcherAfterClose.x + launcherAfterClose.width).toBeCloseTo(movedAnchor.x, 0)
  expect(launcherAfterClose.y + launcherAfterClose.height).toBeCloseTo(movedAnchor.y, 0)

  const main = page.locator('.workspace-main')
  const homeBounds = (await dashboard.boundingBox())!
  const mainBounds = (await main.boundingBox())!
  const mainPadding = await main.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
    }
  })
  const contentX = mainBounds.x + mainPadding.left
  const contentWidth = mainBounds.width - mainPadding.left - mainPadding.right
  expect(homeBounds.x).toBeCloseTo(contentX, 0)
  expect(homeBounds.width).toBeCloseTo(contentWidth, 0)
  for (const text of [
    'END OF OVERVIEW',
    'LOCAL PREVIEW',
    '数据仅作展示',
    'DESIGNED FOR A LITTLE MORE CLARITY.',
    'ACADEMIC ASSISTANT © 2026',
  ]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0)
  }

  await page.getByRole('button', { name: '日程', exact: true }).click()
  await expect(homeTime).not.toBeVisible()
  await expect(page.getByRole('heading', { name: '日程', exact: true })).toBeVisible()
  const scheduleBounds = (await page.locator('.standalone-page').boundingBox())!
  expect(scheduleBounds.x).toBeCloseTo(contentX, 0)
  expect(scheduleBounds.width).toBeCloseTo(contentWidth, 0)
  await page.getByRole('button', { name: '11.13 / 周五' }).click()
  await expect(page.getByRole('heading', { name: '这一天，还留有空白。' })).toBeVisible()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的', exact: true })).toBeVisible()
  const profileBounds = (await page.locator('.standalone-page').boundingBox())!
  expect(profileBounds.x).toBeCloseTo(contentX, 0)
  expect(profileBounds.width).toBeCloseTo(contentWidth, 0)
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await expect(page.getByRole('log')).toContainText('你有 3 项待完成任务')
  await input.fill('我最近的学习进度怎么样？')
  await input.press('Enter')
  await expect(page.getByRole('log')).toContainText('高等数学  65%')
  await page.getByRole('button', { name: '新对话' }).click()
  await expect(page.getByRole('log')).toHaveCount(0)
  await expect(page.getByText('留一点空间，给新的想法。')).toHaveCount(0)
  await expect(page.getByText('LESS NOISE. MORE FOCUS.')).toHaveCount(0)

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('课程任务会唤起助手，本地偏好和输入校验保持可用', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled()
  await page.getByRole('textbox', { name: '向学习助手提问' }).fill('   ')
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled()
  await page.getByRole('button', { name: '关闭学习助手' }).click()

  await page.getByRole('button', { name: '查看全部 5 门课程' }).click()
  await expect(page.getByRole('button', { name: '查看程序设计基础详情' })).toBeVisible()
  await page.getByRole('button', { name: '查看待办详情' }).click()
  await expect(page.getByRole('dialog')).toContainText('组合体三视图')
  await page.getByRole('button', { name: '和助手一起安排' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Academic Assistant 对话区域' })).toBeVisible()
  await expect(page.getByRole('log')).toContainText('帮我安排工程制图的作业 2任务。')
  await expect(page.getByRole('log')).toContainText('你有 3 项待完成任务')
  await page.getByRole('button', { name: '关闭学习助手' }).click()

  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('switch', { name: '学业提醒' }).click()
  await expect(page.getByRole('switch', { name: '学业提醒' })).not.toBeChecked()
  await page.getByRole('button', { name: '主页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '学业提醒已暂停' })).toBeVisible()
})

test('预览主页手机端今日安排与学业简报单列铺满', async ({ page }) => {
  await page.goto('/?demo=1')
  for (const width of [320, 360, 390, 600, 740, 760]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.locator('.dashboard-middle').evaluate((element) => {
      const parent = element.getBoundingClientRect()
      return {
        x: parent.x,
        width: parent.width,
        cards: Array.from(element.children).map((child) => {
          const rect = child.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom }
        }),
      }
    })
    expect(layout.cards).toHaveLength(2)
    for (const card of layout.cards) {
      expect(card.x).toBeCloseTo(layout.x, 0)
      expect(card.width).toBeCloseTo(layout.width, 0)
    }
    expect(layout.cards[1].y).toBeGreaterThanOrEqual(layout.cards[0].bottom)
    await expect(page.locator('.dashboard-middle .module-subtitle').first()).toBeVisible()
    await expect(page.locator('.dashboard-middle .module-subtitle').last()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('320px 窄屏无全局横向溢出，主要操作保持可用', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/?demo=1')
  await expect(page.getByRole('button', { name: '主页', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '日程', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '我的', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开学习助手' })).toBeVisible()
  await expectFontSize(page.locator('.schedule-list time').first())
  await expectFontSize(page.locator('.course-task small').first())
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('button', { name: '打开学习助手' }).click()
  const assistant = page.getByRole('region', { name: 'Academic Assistant 对话区域' })
  await expect(assistant).toBeVisible()
  await expect(page.getByRole('textbox', { name: '向学习助手提问' })).toBeVisible()
  const box = (await assistant.boundingBox())!
  expect(Math.round(box.width)).toBe(320)
  expect(box.x).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('手机软键盘收缩可视区域后输入框仍保持可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    let viewportHeight = 844
    let viewportOffsetTop = 0
    const viewport = new EventTarget()
    Object.defineProperties(viewport, {
      height: { get: () => viewportHeight },
      offsetTop: { get: () => viewportOffsetTop },
    })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    Object.defineProperty(window, '__setVisualViewport', {
      value: (height: number, offsetTop = 0) => {
        viewportHeight = height
        viewportOffsetTop = offsetTop
        viewport.dispatchEvent(new Event('resize'))
      },
    })
  })
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '打开学习助手' }).click()
  const assistant = page.getByRole('region', { name: 'Academic Assistant 对话区域' })
  const input = page.getByRole('textbox', { name: '向学习助手提问' })
  const mobileMorph = page.locator('.chat-morph-shell')
  await expect(mobileMorph).toHaveCount(0)
  await expect(input).toBeFocused()
  await input.fill('第一行')
  await input.press('Enter')
  await expect(input).toHaveValue('第一行\n')
  await expect(page.getByRole('log')).toHaveCount(0)
  await expect(page.getByText('点击发送按钮发送 · 回车换行')).toBeVisible()
  await page.evaluate(() => {
    ;(window as typeof window & { __setVisualViewport: (height: number) => void }).__setVisualViewport(
      500,
    )
  })
  await expect(assistant).toHaveCSS('height', '500px')
  const inputBox = (await input.boundingBox())!
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(500)
})

test('桌面浮窗不随工作台滚动，手机助手铺满屏幕且可关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '查看全部 5 门课程' }).click()
  await page.getByRole('button', { name: '打开学习助手' }).click()
  const dashboard = page.locator('#dashboard')
  const assistant = page.getByRole('region', { name: 'Academic Assistant 对话区域' })
  const input = page.getByRole('textbox', { name: '向学习助手提问' })
  await assistant.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  const before = (await assistant.boundingBox())!
  await dashboard.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect((await assistant.boundingBox())!.y).toBe(before.y)
  await input.fill('帮我总结一下高等数学的重点。')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByRole('log')).toContainText('拉格朗日中值定理')

  await page.getByRole('button', { name: '关闭学习助手' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await expect(input).not.toBeFocused()
  const mobileMorph = page.locator('.chat-morph-shell')
  await expect(mobileMorph).toHaveCSS('animation-name', 'chat-morph-expand')
  await expect(mobileMorph).toHaveCount(0)
  await expect(input).toBeFocused()
  const mobile = (await assistant.boundingBox())!
  expect(mobile.x).toBe(0)
  expect(mobile.y).toBe(0)
  expect(Math.round(mobile.width)).toBe(390)
  expect(Math.round(mobile.height)).toBe(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '关闭学习助手' }).click()
  await expect(assistant).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开学习助手' })).toBeFocused()
})
