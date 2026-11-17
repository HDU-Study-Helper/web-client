import { test, expect, type Page } from '@playwright/test'

const officialURL = 'https://example.com/authorize'
const qrImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVqkAAAAASUVORK5CYII='

async function openAuth(page: Page, holdCreate = false, lifetime = 120000) {
  let releaseCreate = () => {}
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve
  })
  const state = { status: 'pending', failPoll: false, polls: 0, creates: 0 }
  let expiresAt: string | undefined
  await page
    .context()
    .addCookies([{ name: 'academic_csrf', value: 'fixture-csrf', url: 'http://127.0.0.1:5173' }])
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      })
    const auth = () => ({
      status: state.status,
      expires_at: (expiresAt ??= new Date(Date.now() + lifetime).toISOString()),
      poll_after_ms: 2000,
      qr_url: officialURL,
      qr_image: qrImage,
    })
    if (path === '/auth/me')
      return json({
        id: 'modal-student',
        username: 'student',
        display_name: '测试同学',
        role: 'user',
      })
    if (path === '/platforms/sources')
      return json({
        items: [
          {
            source: 'chaoxing',
            name: '学习通',
            qr_login: true,
            resources: [],
          },
        ],
      })
    if (path === '/platforms/connections' || path === '/dws/connections') return json({ items: [] })
    if (path === '/platforms/chaoxing/auth') {
      state.creates++
      if (holdCreate) await createGate
      return json({ connection: { id: 'modal-fixture' }, auth: auth() }, 201)
    }
    if (path === '/platforms/connections/modal-fixture/auth') {
      state.polls++
      if (state.failPoll) return json({ error: { code: 'upstream', message: '授权检查失败' } }, 502)
      return json(auth())
    }
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 })
    return json({ error: { code: 'not_found', message: `Unexpected fixture: ${path}` } }, 404)
  })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '连接学习通', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '连接学习通' })
  await expect(dialog).toBeVisible()
  return { state, releaseCreate, trigger, dialog }
}

test('Modal 具有唯一标题及说明关联，初始 pending 聚焦可取消主操作', async ({ page }) => {
  const { dialog, releaseCreate, trigger } = await openAuth(page, true)
  await expect(dialog.getByRole('button', { name: '取消连接', exact: true })).toBeFocused()
  const firstTitle = await dialog.getAttribute('aria-labelledby')
  const description = await dialog.getAttribute('aria-describedby')
  expect(firstTitle).toBeTruthy()
  expect(description).toBeTruthy()
  await expect(page.locator(`[id="${firstTitle}"]`)).toHaveText('连接学习通')
  await expect(page.locator(`[id="${description}"]`)).toContainText('第二台设备')
  await dialog.getByRole('button', { name: '取消连接', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  releaseCreate()
  await trigger.click()
  await expect(dialog).toBeVisible()
  expect(await dialog.getAttribute('aria-labelledby')).not.toBe(firstTitle)
})

for (const moveFocus of [false, true]) {
  test(`官方链接异步到达${moveFocus ? '不抢用户已移动的焦点' : '承接初始取消操作的焦点'}`, async ({
    page,
  }) => {
    const { dialog, releaseCreate } = await openAuth(page, true)
    const cancel = dialog.getByRole('button', { name: '取消连接', exact: true })
    const close = dialog.getByRole('button', { name: '关闭弹窗' })
    await expect(cancel).toBeFocused()
    if (moveFocus) await close.focus()
    releaseCreate()
    const link = dialog.getByRole('link', { name: '打开学习通官方授权页（新窗口）' })
    await expect(link).toBeVisible()
    await expect(moveFocus ? close : link).toBeFocused()
  })
}

test('授权状态有独立 polite 名称，倒计时逐秒变化不改写播报区域', async ({ page }) => {
  await page.clock.install()
  const { dialog, state } = await openAuth(page)
  const status = dialog.getByRole('status', { name: '授权状态' })
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toHaveText('等待扫码授权')
  await expect(dialog.locator('.muted[aria-hidden="true"]')).toContainText(':')
  await status.evaluate((element) => {
    const target = window as unknown as { statusMutations: number }
    target.statusMutations = 0
    new MutationObserver((records) => {
      target.statusMutations += records.length
    }).observe(element, {
      subtree: true,
      characterData: true,
      childList: true,
    })
  })
  await page.clock.runFor(1100)
  expect(
    await page.evaluate(() => (window as unknown as { statusMutations: number }).statusMutations),
  ).toBe(0)
  state.status = 'scanned'
  await page.clock.runFor(1000)
  await expect(status).toHaveText('已扫码，请在手机上确认')
  await page.clock.runFor(1100)
  await expect(status).toHaveText('已扫码，请在手机上确认')
})

test('退出动画期间Escape后立即Enter不会重新授权', async ({ page }) => {
  await page.clock.install()
  const { dialog, state } = await openAuth(page)
  state.status = 'expired'
  await page.clock.runFor(2100)
  await expect(dialog.getByRole('button', { name: '重新获取', exact: true })).toBeFocused()
  const before = { creates: state.creates, polls: state.polls }
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.clock.runFor(300)
  await expect(dialog).toHaveCount(0)
  expect({ creates: state.creates, polls: state.polls }).toEqual(before)
})

for (const failure of ['expired', 'failed', 'network'] as const) {
  test(`${failure} 迁移聚焦重试，后续 clock 不再抢焦点`, async ({ page }) => {
    await page.clock.install()
    const { dialog, state } = await openAuth(page)
    await expect(dialog.getByRole('link')).toBeVisible()
    if (failure === 'network') state.failPoll = true
    else state.status = failure
    await page.clock.runFor(2100)
    const retry = dialog.getByRole('button', {
      name: failure === 'network' ? '继续检查授权' : '重新获取',
      exact: true,
    })
    await expect(retry).toBeFocused()
    await expect(dialog.getByRole('status', { name: '授权状态' })).toHaveText(
      failure === 'expired' ? '二维码已失效，请重新获取' : '授权未完成，请重试',
    )
    const close = dialog.getByRole('button', { name: '关闭弹窗' })
    await close.focus()
    await page.clock.runFor(3100)
    await expect(close).toBeFocused()
  })
}

test('本地倒计时到期只聚焦一次重试操作', async ({ page }) => {
  await page.clock.install()
  const { dialog } = await openAuth(page, false, 3000)
  await expect(dialog.getByRole('link')).toBeVisible()
  await page.clock.runFor(3100)
  await expect(dialog.getByRole('button', { name: '重新获取', exact: true })).toBeFocused()
  const close = dialog.getByRole('button', { name: '关闭弹窗' })
  await close.focus()
  await page.clock.runFor(3100)
  await expect(close).toBeFocused()
  await expect(dialog.getByRole('status', { name: '授权状态' })).toHaveText(
    '二维码已失效，请重新获取',
  )
})

for (const cancelSuccess of [false, true]) {
  test(`授权成功保留播报时间${cancelSuccess ? '且关闭取消成功回调' : '后才完成连接'}`, async ({
    page,
  }) => {
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const { dialog, state } = await openAuth(page)
    await expect(dialog.getByRole('link')).toBeVisible()
    state.status = 'authorized'
    await page.clock.runFor(2100)
    await expect(dialog.getByRole('status', { name: '授权状态' })).toHaveText(
      '授权成功，正在完成连接',
    )
    await page.clock.runFor(500)
    await expect(dialog).toBeVisible()
    if (cancelSuccess) await page.keyboard.press('Escape')
    await page.clock.runFor(1100)
    await expect(dialog).toHaveCount(0)
    if (cancelSuccess) await expect(page.getByText('平台授权成功。')).toHaveCount(0)
    else await expect(page.getByText('平台授权成功。')).toBeVisible()
  })
}
