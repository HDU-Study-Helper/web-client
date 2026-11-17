import { test, expect, type Locator, type Page, type Route } from '@playwright/test'

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

const user = { id: 'fixture-student', username: 'student', display_name: '测试同学', role: 'user' }
const school = {
  id: 'jwxt-fixture',
  user_id: user.id,
  source: 'jwxt',
  state: 'active',
  enabled: true,
}
const dws = { id: 'dws-fixture', user_id: user.id, state: 'active', enabled: true }
const sources = ['chaoxing', 'mooc', 'ucampus', 'jwxt'].map((source) => ({
  source,
  name: source,
  qr_login: source !== 'jwxt',
  password_login: source === 'jwxt',
  resources: [],
}))
const csrf = 'fixture-csrf'
const draft = {
  version: 1,
  step: 3,
  academicYear: 2026,
  term: 1,
  monday: '2026-09-07',
  periods: [
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:55', end: '09:40' },
  ],
  completed: false,
}

async function fixture(
  page: Page,
  options: {
    authenticated?: boolean
    activeSchool?: boolean
    activeDws?: boolean
    role?: string
  } = {},
) {
  let authenticated = options.authenticated || false
  let platformConnections = options.activeSchool ? [school] : []
  let dwsConnections = options.activeDws ? [dws] : []
  let savedGroups = [{ id: 'retained', name: '已有课程群' }]
  const requests: {
    path: string
    method: string
    body: unknown
    csrf?: string
    origin?: string
  }[] = []
  let authPolls = 0
  let dwsPolls = 0
  await page
    .context()
    .addCookies([{ name: 'academic_csrf', value: csrf, url: 'http://127.0.0.1:5173' }])
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/v1', '')
    const method = request.method(),
      body = request.postDataJSON()
    requests.push({
      path,
      method,
      body,
      csrf: request.headers()['x-csrf-token'],
      origin: request.headers().origin,
    })
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/auth/me')
      return authenticated
        ? json({ ...user, role: options.role || user.role })
        : json({ error: { code: 'unauthenticated' } }, 401)
    if (path === '/auth/login') {
      if (body.password !== 'correct-password')
        return json({ error: { code: 'unauthenticated' } }, 401)
      authenticated = true
      return json({ ...user, role: options.role || user.role })
    }
    if (path === '/auth/logout') {
      authenticated = false
      return route.fulfill({ status: 204 })
    }
    if (path === '/platforms/sources') return json({ items: sources })
    if (path === '/platforms/connections') return json({ items: platformConnections })
    if (path === '/dws/connections') return json({ items: dwsConnections })
    if (path === '/platforms/jwxt/login') {
      platformConnections = [school]
      return json(school, 201)
    }
    if (path === '/platforms/chaoxing/auth')
      return json(
        {
          connection: { id: 'cx-fixture' },
          auth: {
            status: 'pending',
            expires_at: new Date(Date.now() + 120000).toISOString(),
            poll_after_ms: 2000,
            qr_url: 'https://example.com/official-login',
          },
        },
        201,
      )
    if (path === '/platforms/connections/cx-fixture/auth') {
      authPolls++
      platformConnections.push({ ...school, id: 'cx-fixture', source: 'chaoxing' })
      return json({ status: 'authorized', expires_at: new Date(Date.now() + 120000).toISOString() })
    }
    if (path === '/dws/link')
      return json(
        {
          id: 'challenge',
          connection_id: dws.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 120000).toISOString(),
          verification_uri: 'https://example.com/dws-login',
          user_code: 'ABCD-EFGH',
        },
        202,
      )
    if (path === '/dws/connections/dws-fixture/link/challenge') {
      if (method === 'DELETE') return json({ status: 'cancelled' })
      dwsPolls++
      dwsConnections = [dws]
      return json({ status: 'authorized', expires_at: new Date(Date.now() + 120000).toISOString() })
    }
    if (path === '/dws/connections/dws-fixture/groups') {
      if (method === 'PUT') {
        savedGroups = body.groups
        return route.fulfill({ status: 204 })
      }
      return json({ items: savedGroups })
    }
    if (path === '/dws/connections/dws-fixture/available-groups')
      return json(
        url.searchParams.has('cursor')
          ? { items: [{ id: 'second', name: '实验课程群' }], has_more: false }
          : { items: [{ id: 'first', name: '班级通知群' }], has_more: true, next_cursor: 'page2' },
      )
    if (path === '/platforms/connections/jwxt-fixture/sync')
      return json({
        academic_year: 2026,
        term: 1,
        records: 3,
        generated: 48,
        skipped_practice: 1,
        retired_modifications: [],
      })
    return json({ error: { code: 'not_found', message: 'Unexpected fixture request' } }, 404)
  })
  return { requests, authPolls: () => authPolls, dwsPolls: () => dwsPolls }
}
async function setDraft(page: Page, value: unknown = draft, id = user.id) {
  await page.addInitScript(
    ({ id, value }) => localStorage.setItem(`haa:setup:v1:${id}`, JSON.stringify(value)),
    { id, value },
  )
}

test('登录校验、密码显隐、角色菜单和安全退出', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await expect(page.getByText('WELCOME TO YOUR STUDY OS')).toHaveCount(0)
  await expect(page.getByText('YOUR PERSONAL STUDY OS / V0.1')).toHaveCount(0)
  await expectFontSize(page.locator('.login-subtitle'), 14)
  await expectFontSize(page.locator('.preview-entry-note'))
  await page.getByLabel('账号', { exact: true }).fill('student')
  await page.getByLabel('密码', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: '显示密码' }).click()
  await expect(page.locator('#password')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const loginError = page.getByRole('alert')
  await expect(loginError).toContainText('用户名或密码错误')
  await expectTextContrast(loginError)
  await page.getByLabel('密码', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '把学习平台，连在一起。' })).toBeVisible()
  await expect(page.getByRole('link', { name: '管理后台' })).toHaveCount(0)
  expect(state.requests.filter((r) => r.path === '/auth/login')).toHaveLength(2)
  expect(state.requests.find((r) => r.path === '/auth/login')?.csrf).toBe(csrf)
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByText('已安全退出登录。')).toBeVisible()
})

test('后端只实现登录却缺少向导路由时，明确提示服务配置问题', async ({ page }) => {
  await fixture(page, { authenticated: true })
  for (const path of ['platforms/sources', 'platforms/connections', 'dws/connections']) {
    await page.route(`**/api/v1/${path}`, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'not_found', message: '接口不存在' } }),
      }),
    )
  }
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('当前后端未提供平台连接服务')
  await expect(page.getByRole('button', { name: '连接学习通', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '连接钉钉', exact: true })).toBeDisabled()
})

test('手机平台卡单列排列，长名称完整显示且操作区域足够大', async ({ page }) => {
  await fixture(page, { authenticated: true, activeDws: true })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '选择群', exact: true })).toBeEnabled()
  for (const width of [320, 360, 390, 600, 601, 740]) {
    await page.setViewportSize({ width, height: 844 })
    const cards = page.locator('.platform-card')
    await expect(cards).toHaveCount(4)
    if (width === 390) {
      await page.locator('.platform-grid').screenshot({ path: 'test-results/platform-cards-mobile-390.png' })
    }
    const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
      const card = element.getBoundingClientRect()
      const title = element.querySelector('h3')!
      const status = element.querySelector('.connection-pill')!
      const action = element.querySelector('button')!
      const nameBox = title.getBoundingClientRect()
      const statusBox = status.getBoundingClientRect()
      const actionBox = action.getBoundingClientRect()
      return {
        x: card.x, right: card.right, y: card.y, bottom: card.bottom,
        titleFits: title.scrollWidth <= title.clientWidth,
        statusSeparate: nameBox.right <= statusBox.left,
        actionWidth: actionBox.width,
        actionHeight: actionBox.height,
        availableWidth: element.querySelector('.platform-card-action')!.clientWidth,
      }
    }))
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(width)
      expect(box.titleFits).toBe(true)
      expect(box.statusSeparate).toBe(true)
      expect(box.actionHeight).toBeGreaterThanOrEqual(44)
      expect(box.actionWidth).toBeCloseTo(box.availableWidth, 0)
      if (index > 0) {
        expect(box.x).toBeCloseTo(boxes[0].x, 0)
        expect(box.y).toBeGreaterThanOrEqual(boxes[index - 1].bottom)
      }
    }
    await expect(page.getByRole('heading', { name: '中国大学 MOOC', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: '选择群', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('完整向导：钉钉授权、保留旧群、分页选群、教务连接和课表导入', async ({ page }) => {
  const state = await fixture(page, { authenticated: true })
  await page.goto('/')
  await page.getByRole('button', { name: '连接钉钉' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('ABCD-EFGH')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 8000 })
  expect(state.dwsPolls()).toBe(1)
  await page.getByRole('button', { name: '选择群' }).click()
  await page.getByRole('button', { name: '加载更多群' }).click()
  await page.getByLabel('实验课程群').check()
  await page.getByRole('button', { name: '保存选择' }).click()
  const save = state.requests.find((r) => r.path.endsWith('/groups') && r.method === 'PUT')
  expect(save?.body).toEqual({
    groups: [
      { id: 'retained', name: '已有课程群' },
      { id: 'second', name: '实验课程群' },
    ],
  })
  await page.getByRole('button', { name: '连接学习通', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 8000 })
  expect(state.authPolls()).toBe(1)
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('学号 / 统一认证账号').fill('synthetic-student')
  await page.getByLabel('统一认证密码', { exact: true }).fill('synthetic-school-password')
  await page.getByRole('button', { name: '连接教务处' }).click()
  await expect(page.getByRole('heading', { name: '教务已连接' })).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'synthetic-school-password',
  )
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('combobox', { name: '学年', exact: true }).selectOption('2026')
  await page.getByRole('combobox', { name: '学期', exact: true }).selectOption('1')
  await page.getByLabel('第一教学周的周一').fill('2026-09-07')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('每天节数').fill('2')
  await page.getByRole('button', { name: '生成时间表' }).click()
  await page.getByRole('button', { name: '完成设置并导入课表' }).click()
  await expect(page.getByText('时间表就绪，新学期见。')).toBeVisible()
  await expect(page.getByText(/生成 48 次课程安排/)).toBeVisible()
  const sync = state.requests.find((r) => r.path.endsWith('/sync'))!
  expect(sync.csrf).toBe(csrf)
  expect(sync.body).toEqual({
    resource: 'schedule',
    academic_year: 2026,
    term: 1,
    calendar: {
      week_one_monday: '2026-09-07',
      periods: [
        { period: 1, start: '08:00', end: '08:45' },
        { period: 2, start: '08:55', end: '09:40' },
      ],
    },
  })
  await page.getByRole('button', { name: '进入学业工作台' }).click()
  await expect(page.getByRole('button', { name: '打开学习助手' })).toBeVisible()
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await expect(page.getByRole('region', { name: 'Academic Assistant 对话区域' })).toBeVisible()
  await page.getByRole('button', { name: '关闭学习助手' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '打开学习助手' })).toBeVisible()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '查看设置' }).click()
  await expect(page.getByText('时间表就绪，新学期见。')).toBeVisible()
  expect(state.requests.filter((r) => r.path.endsWith('/sync'))).toHaveLength(1)
})

test('手机十二节作息双行编辑，删除可键盘撤销并保留时间', async ({ page }) => {
  await fixture(page, { authenticated: true, activeSchool: true })
  const periods = Array.from({ length: 12 }, (_, index) => {
    const start = 480 + index * 55
    const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    return { period: index + 1, start: time(start), end: time(start + 45) }
  })
  await setDraft(page, { ...draft, periods })
  await page.goto('/')
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const rows = page.locator('.period-row')
    await expect(rows).toHaveCount(12)
    const geometry = await rows.first().evaluate((element) => {
      const number = element.querySelector('.period-number')!.getBoundingClientRect()
      const fields = Array.from(element.querySelectorAll('input')).map((field) => {
        const rect = field.getBoundingClientRect()
        return { y: rect.y, height: rect.height, width: rect.width, right: rect.right }
      })
      const actions = Array.from(element.querySelectorAll('button')).map((button) => {
        const rect = button.getBoundingClientRect()
        return { x: rect.x, right: rect.right, width: rect.width, height: rect.height }
      })
      return { numberBottom: number.bottom, fields, actions }
    })
    expect(geometry.fields[0].y).toBeGreaterThanOrEqual(geometry.numberBottom)
    expect(geometry.fields[0].y).toBeCloseTo(geometry.fields[1].y, 0)
    for (const field of geometry.fields) {
      expect(field.height).toBeGreaterThanOrEqual(44)
      expect(field.right).toBeLessThanOrEqual(width)
    }
    for (const action of geometry.actions) {
      expect(action.width).toBeGreaterThanOrEqual(44)
      expect(action.height).toBeGreaterThanOrEqual(44)
    }
    expect(geometry.actions[1].x - geometry.actions[0].right).toBeGreaterThanOrEqual(8)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByLabel('第 2 节开始时间', { exact: true }).fill('09:00')
  await page.getByRole('button', { name: '删除第 2 节', exact: true }).click()
  await expect(page.locator('.period-row')).toHaveCount(11)
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  await undo.focus()
  await undo.press('Enter')
  await expect(page.locator('.period-row')).toHaveCount(12)
  await expect(page.getByLabel('第 2 节开始时间', { exact: true })).toHaveValue('09:00')
  await expect(page.getByLabel('第 2 节结束时间', { exact: true })).toHaveValue(periods[1].end)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('haa:setup:v1:fixture-student') || '{}'))
  expect(saved.periods[1].start).toBe('09:00')
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await page.getByRole('button', { name: '删除第 3 节', exact: true }).click()
  await page.clock.fastForward(7900)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible()
  await page.clock.fastForward(101)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toHaveCount(0)
})

test('校历与重叠校验阻止错误导入，失败后保留草稿供重试', async ({ page }) => {
  const state = await fixture(page, { authenticated: true, activeSchool: true })
  await setDraft(page, { ...draft, step: 2, monday: '2026-09-08' })
  await page.goto('/')
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('alert')).toContainText('必须从周一开始')
  await page.getByLabel('第一教学周的周一').fill('2026-09-07')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('第 2 节开始时间', { exact: true }).fill('08:30')
  await page.getByRole('button', { name: '完成设置并导入课表' }).click()
  await expect(page.getByRole('alert')).toContainText('时间重叠')
  expect(state.requests.filter((r) => r.path.endsWith('/sync'))).toHaveLength(0)
  await page.getByLabel('第 2 节开始时间', { exact: true }).fill('08:55')
  await page.route('**/api/v1/platforms/connections/jwxt-fixture/sync', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'upstream_unavailable', message: '教务暂时不可用' } }),
    }),
  )
  await page.getByRole('button', { name: '完成设置并导入课表' }).click()
  await expect(page.getByRole('alert')).toContainText('教务暂时不可用')
  await expect(page.getByText('时间表就绪，新学期见。')).toHaveCount(0)
  await expect(page.getByLabel('第 2 节开始时间', { exact: true })).toHaveValue('08:55')
})

test('授权过期与会话失效可恢复，不假报成功', async ({ page }) => {
  await fixture(page, { authenticated: true })
  await page.route('**/api/v1/platforms/chaoxing/auth', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        connection: { id: 'expired' },
        auth: { status: 'expired', expires_at: new Date(Date.now() - 1000).toISOString() },
      }),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '连接学习通', exact: true }).click()
  await expect(page.getByText('二维码已失效', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
  await page.route('**/api/v1/platforms/connections', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthenticated' } }),
    }),
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await expect(page.getByText(/登录已过期，请重新登录/)).toBeVisible()
})

test('手机布局、跳过连接、管理员菜单、草稿按账号隔离', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, { authenticated: true, role: 'admin' })
  await setDraft(page, { ...draft, step: 2 }, 'another-user')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把学习平台，连在一起。' })).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '稍后连接，继续' }).click()
  await page.getByLabel('第一教学周的周一').fill('2026-09-07')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '生成时间表' }).click()
  await expect(page.getByLabel('第 12 节开始时间', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: '保存并完成设置' }).click()
  await expect(page.getByText('设置已保存，随时可以出发。')).toBeVisible()
  await expect(page.getByText('时间表就绪，新学期见。')).toHaveCount(0)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByRole('link', { name: '管理后台' })).toBeVisible()
})

test('群发现失败不覆盖已有选择，初始读取失败禁止保存', async ({ page }) => {
  const state = await fixture(page, { authenticated: true, activeDws: true })
  const unavailable = (route: Route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'upstream_unavailable', message: '群列表暂时不可用' },
      }),
    })
  await page.route('**/available-groups', unavailable)
  await page.goto('/')
  await page.getByRole('button', { name: '选择群' }).click()
  await expect(page.getByRole('alert')).toContainText('已有选择会保留')
  await expect(page.getByLabel('已有课程群')).toBeChecked()
  await page.getByRole('button', { name: '保存选择' }).click()
  expect(
    state.requests.find((r) => r.path.endsWith('/groups') && r.method === 'PUT')?.body,
  ).toEqual({ groups: [{ id: 'retained', name: '已有课程群' }] })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '选择群' })).toBeEnabled()
  await page.route('**/dws/connections/dws-fixture/groups', unavailable)
  await page.getByRole('button', { name: '选择群' }).click()
  await expect(page.getByRole('button', { name: '保存选择' })).toBeDisabled()
})

test('扫码轮询网络失败后继续原授权，关闭时不误断开已成功连接', async ({ page }) => {
  const state = await fixture(page, { authenticated: true })
  let fail = true
  await page.route('**/platforms/connections/cx-fixture/auth', async (route) => {
    if (fail)
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'upstream_unavailable', message: '网络暂时不可用' },
        }),
      })
    return route.fallback()
  })
  await page.goto('/')
  await page.getByRole('button', { name: '连接学习通', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('网络暂时不可用', { timeout: 8000 })
  fail = false
  await page.getByRole('button', { name: '继续检查授权' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.requests.filter((r) => r.path === '/platforms/chaoxing/auth')).toHaveLength(1)
  expect(state.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0)

  // On a second challenge, the close action may discover that authorization already succeeded.
  await page.getByRole('button', { name: '重新授权', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0)
})
