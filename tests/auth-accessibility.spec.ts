import { test, expect, type Page } from '@playwright/test'

const user = {
  id: 'auth-accessibility-student',
  username: 'student',
  display_name: '测试同学',
  role: 'user',
}
const officialURL = 'https://example.com/official-login?challenge=fixture'
const qrImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVqkAAAAASUVORK5CYII='

type Probe = {
  aborted: number
  polls: number
  copied: string[]
  release?: () => void
}
type ProbeWindow = Window & { authProbe: Probe }

// Keep the authenticated route/cookie fixture pattern used by onboarding.spec.ts local to this suite.
async function fixture(
  page: Page,
  options: {
    source?: 'chaoxing' | 'dws'
    hold?: 'create' | 'poll'
    qrURL?: string
    imageOnly?: boolean
    alreadyAuthorized?: boolean
  } = {},
) {
  const source = options.source || 'chaoxing'
  const createPath = source === 'dws' ? '/dws/link' : '/platforms/chaoxing/auth'
  const pollPath =
    source === 'dws'
      ? '/dws/connections/auth-fixture/link/challenge'
      : '/platforms/connections/auth-fixture/auth'
  const requests: { path: string; method: string }[] = []
  await page
    .context()
    .addCookies([{ name: 'academic_csrf', value: 'fixture-csrf', url: 'http://127.0.0.1:5173' }])
  await page.addInitScript(
    ({ createPath, pollPath, hold }) => {
      const probe = { aborted: 0, polls: 0, copied: [] as string[] } as Probe
      ;(window as unknown as ProbeWindow).authProbe = probe
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            probe.copied.push(value)
          },
        },
      })
      const originalFetch = window.fetch.bind(window)
      let held = false
      window.fetch = (input, init) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          location.href,
        ).pathname.replace('/api/v1', '')
        if (path === pollPath && (init?.method || 'GET') === 'GET') probe.polls++
        if (
          !held &&
          ((hold === 'create' && path === createPath) || (hold === 'poll' && path === pollPath))
        ) {
          held = true
          return new Promise<Response>((resolve) => {
            // Deliberately resolve even after abort: a late upstream response must remain ignored.
            probe.release = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    error: { code: 'late_error', message: '迟到授权错误不得显示' },
                  }),
                  { status: 502, headers: { 'Content-Type': 'application/json' } },
                ),
              )
            init?.signal?.addEventListener(
              'abort',
              () => {
                probe.aborted++
              },
              { once: true },
            )
          })
        }
        return originalFetch(input, init)
      }
    },
    { createPath, pollPath, hold: options.hold },
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const method = route.request().method()
    requests.push({ path, method })
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      })
    const auth = {
      status: 'pending',
      expires_at: new Date(Date.now() + 120000).toISOString(),
      poll_after_ms: 2000,
      ...(source === 'dws'
        ? { verification_uri: officialURL, user_code: 'ABCD-EFGH' }
        : options.imageOnly
          ? { qr_image: qrImage }
          : { qr_url: options.qrURL ?? officialURL, qr_image: qrImage }),
    }
    if (path === '/auth/me') return json(user)
    if (path === '/platforms/sources')
      return json({
        items: [
          {
            source: 'chaoxing',
            name: '学习通',
            qr_login: true,
            password_login: false,
            resources: [],
          },
        ],
      })
    if (path === '/platforms/connections' || path === '/dws/connections') return json({ items: [] })
    if (path === createPath)
      return json(
        source === 'dws'
          ? { ...auth, id: 'challenge', connection_id: 'auth-fixture' }
          : { connection: { id: 'auth-fixture' }, auth },
        201,
      )
    if (path === pollPath)
      return json(
        method === 'DELETE'
          ? { status: 'cancelled' }
          : { ...auth, status: options.alreadyAuthorized ? 'authorized' : auth.status },
      )
    if (path === '/platforms/connections/auth-fixture/' && method === 'DELETE') {
      return route.fulfill({ status: 204 })
    }
    return json({ error: { code: 'not_found', message: 'Unexpected fixture request' } }, 404)
  })
  await page.goto('/')
  const trigger = page.getByRole('button', {
    name: source === 'dws' ? '连接钉钉' : '连接学习通',
    exact: true,
  })
  await expect(trigger).toBeEnabled()
  // Also verify focus restoration while the onClose refresh temporarily disables the trigger.
  await trigger.focus()
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return { trigger, requests }
}

for (const source of ['chaoxing', 'dws'] as const) {
  for (const close of ['X', 'Escape', 'Back', 'Backdrop'] as const) {
    test(`${source} 创建 pending 时可用 ${close} 关闭、中止请求并恢复焦点`, async ({ page }) => {
      const { trigger, requests } = await fixture(page, { source, hold: 'create' })
      await expect(page.getByRole('button', { name: '关闭弹窗' })).toBeEnabled()
      if (close === 'X') await page.getByRole('button', { name: '关闭弹窗' }).click()
      else if (close === 'Escape') await page.keyboard.press('Escape')
      else if (close === 'Backdrop') await page.mouse.click(4, 4)
      else await page.goBack()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await expect
        .poll(() => page.evaluate(() => (window as unknown as ProbeWindow).authProbe.aborted))
        .toBe(1)
      await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.release?.())
      await expect(page.getByText('迟到授权错误不得显示')).toHaveCount(0)
      await expect(page.getByText('平台授权成功。')).toHaveCount(0)
      expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(0)
      await expect.poll(() => page.evaluate(() => history.state?.haaAuthDialog)).toBeFalsy()
    })
  }
}

for (const source of ['chaoxing', 'dws'] as const) {
  test(`${source} 关闭中止进行中的轮询且不重新安排计时器`, async ({ page }) => {
    await page.clock.install()
    const { trigger, requests } = await fixture(page, { source, hold: 'poll' })
    await expect(
      page.getByRole('img', { name: `${source === 'dws' ? '钉钉' : '学习通'}授权二维码` }),
    ).toBeVisible()
    await page.clock.runFor(2100)
    await expect
      .poll(() => page.evaluate(() => (window as unknown as ProbeWindow).authProbe.polls))
      .toBe(1)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as ProbeWindow).authProbe.aborted))
      .toBe(1)
    await expect
      .poll(() => requests.filter((request) => request.method === 'DELETE').length)
      .toBe(1)
    await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.release?.())
    const pollsAfterCleanup = await page.evaluate(
      () => (window as unknown as ProbeWindow).authProbe.polls,
    )
    await page.clock.runFor(30000)
    expect(await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.polls)).toBe(
      pollsAfterCleanup,
    )
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('平台授权成功。')).toHaveCount(0)
  })
}

test('关闭时再次检查已授权的平台连接，避免误删成功连接', async ({ page }) => {
  const { trigger, requests } = await fixture(page, { alreadyAuthorized: true })
  await expect(page.getByRole('img', { name: '学习通授权二维码' })).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect
    .poll(() =>
      requests.some((request) => request.path.endsWith('/auth') && request.method === 'GET'),
    )
    .toBe(true)
  expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(0)
})

test('轮询尚未开始时关闭会清除待执行的轮询计时器', async ({ page }) => {
  await page.clock.install()
  const { requests } = await fixture(page)
  await expect(page.getByRole('img', { name: '学习通授权二维码' })).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect.poll(() => requests.filter((request) => request.method === 'DELETE').length).toBe(1)
  const pollsAfterCleanup = await page.evaluate(
    () => (window as unknown as ProbeWindow).authProbe.polls,
  )
  await page.clock.runFor(30000)
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.polls)).toBe(
    pollsAfterCleanup,
  )
})

test('关闭不回退外部导航写入的 history state 或 URL', async ({ page }) => {
  await fixture(page, { hold: 'create' })
  await page.evaluate(() => {
    history.pushState({ externalNavigation: true }, '', '?external-navigation=1')
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\?external-navigation=1$/)
  expect(await page.evaluate(() => history.state)).toEqual({ externalNavigation: true })
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.aborted)).toBe(1)
})

test('普通平台提供含平台名、新窗口说明和安全 rel 的官方链接，并可复制相同链接', async ({
  page,
}) => {
  await fixture(page)
  const link = page.getByRole('link', { name: '打开学习通官方授权页（新窗口）' })
  await expect(link).toHaveAttribute('href', officialURL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await page.getByRole('button', { name: '复制学习通安全授权链接' }).click()
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).authProbe.copied)).toEqual([
    officialURL,
  ])
  await expect(page.getByRole('status').filter({ hasText: '安全授权链接已复制' })).toBeVisible()
})

for (const qrURL of [
  'http://example.com/login',
  'https://student:secret@example.com/login',
  'https://student@example.com/login',
  'https://:secret@example.com/login',
  'javascript:alert(1)',
  'not a URL',
]) {
  test(`拒绝不安全授权链接：${qrURL}`, async ({ page }) => {
    await fixture(page, { qrURL })
    await expect(page.getByRole('img', { name: '学习通授权二维码' })).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '复制学习通安全授权链接' })).toHaveCount(0)
    await expect(page.getByText(/此授权方式需要第二台设备/)).toBeVisible()
  })
}

test('仅提供二维码图片时明确说明第二设备要求', async ({ page }) => {
  await fixture(page, { imageOnly: true })
  await expect(page.getByRole('img', { name: '学习通授权二维码' })).toBeVisible()
  await expect(page.getByText(/另一台设备上的学习通 App.*此授权方式需要第二台设备/)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
})

test('钉钉保留验证码、官方授权入口和取消挑战流程', async ({ page }) => {
  const { requests } = await fixture(page, { source: 'dws' })
  await expect(page.getByText('ABCD-EFGH')).toBeVisible()
  await expect(page.getByRole('link', { name: '打开钉钉官方授权页（新窗口）' })).toHaveAttribute(
    'href',
    officialURL,
  )
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect
    .poll(() =>
      requests.filter((request) => request.method === 'DELETE').map((request) => request.path),
    )
    .toEqual(['/dws/connections/auth-fixture/link/challenge'])
})
