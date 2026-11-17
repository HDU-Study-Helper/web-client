import { test, expect, type Page } from '@playwright/test'

type Group = { id: string; name: string }
type RecordedRequest = { path: string; method: string; body: unknown }

const retained = { id: 'retained', name: '已有课程群' }
const available = [
  { id: 'first', name: '班级通知群' },
  { id: 'second', name: '实验课程群' },
]
const groupsPath = '/dws/connections/dws-fixture/groups'
const availablePath = '/dws/connections/dws-fixture/available-groups'

async function groupFixture(
  page: Page,
  options: { discoveryFailsOnce?: boolean; holdSave?: boolean; saved?: Group[] } = {},
) {
  const user = { id: 'fixture-student', username: 'student', display_name: '测试同学', role: 'user' }
  let savedGroups = options.saved ?? [retained]
  let discoveries = 0
  let releaseSave!: () => void
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
  const requests: RecordedRequest[] = []
  const failedSaves: string[] = []
  page.on('requestfailed', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/v1${groupsPath}`)
      failedSaves.push(request.failure()?.errorText ?? 'request failed')
  })
  await page.context().addCookies([
    { name: 'academic_csrf', value: 'fixture-csrf', url: 'http://127.0.0.1:5173' },
  ])
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    const method = request.method()
    const body = request.postDataJSON()
    requests.push({ path, method, body })
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/auth/me') return json(user)
    if (path === '/platforms/sources')
      return json({
        items: ['chaoxing', 'mooc', 'ucampus', 'jwxt'].map((source) => ({
          source, name: source, qr_login: source !== 'jwxt', password_login: source === 'jwxt', resources: [],
        })),
      })
    if (path === '/platforms/connections') return json({ items: [] })
    if (path === '/dws/connections')
      return json({ items: [{ id: 'dws-fixture', user_id: user.id, state: 'active', enabled: true }] })
    if (path === groupsPath && method === 'GET') return json({ items: savedGroups })
    if (path === groupsPath && method === 'PUT') {
      // The server commits before responding: closing the dialog cannot undo this write.
      savedGroups = body.groups
      if (options.holdSave) await saveGate
      return route.fulfill({ status: 204 })
    }
    if (path === availablePath && method === 'GET') {
      discoveries++
      if (options.discoveryFailsOnce && discoveries === 1)
        return json({ error: { code: 'upstream_unavailable', message: '群列表暂时不可用' } }, 502)
      return json({ items: available, has_more: false })
    }
    return json({ error: { code: 'not_found', message: 'Unexpected fixture request' } }, 404)
  })
  return {
    requests,
    failedSaves,
    releaseSave,
    savedGroups: () => savedGroups,
    savedReads: () => requests.filter((request) => request.path === groupsPath && request.method === 'GET'),
    saves: () => requests.filter((request) => request.path === groupsPath && request.method === 'PUT'),
    discoveries: () => requests.filter((request) => request.path === availablePath),
  }
}

test('P2-17 发现失败后取消已有选项，重试只发现群且保留未保存的取消', async ({ page }) => {
  const state = await groupFixture(page, { discoveryFailsOnce: true })
  await page.goto('/')
  await expect(page.locator('.group-caption')).toHaveText('已选择 1 个采集群')
  await page.getByRole('button', { name: '选择群', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('已有选择会保留')
  await page.getByRole('checkbox', { name: retained.name }).uncheck()
  const savedReads = state.savedReads().length

  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: available[1].name })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: retained.name })).not.toBeChecked()
  await expect(page.getByRole('button', { name: '重试加载', exact: true })).toHaveCount(0)
  expect(state.savedReads()).toHaveLength(savedReads)
  expect(state.discoveries()).toHaveLength(2)
  expect(state.discoveries().every((request) => request.method === 'GET')).toBe(true)

  await page.getByRole('button', { name: /保存选择/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.saves()).toHaveLength(1)
  expect(state.saves()[0].body).toEqual({ groups: [] })
})

test('P2-17 慢 PUT 期间发现重试禁用，不重复发现或保存', async ({ page }) => {
  const state = await groupFixture(page, { discoveryFailsOnce: true, holdSave: true })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: '选择群', exact: true }).click()
    const retry = page.getByRole('button', { name: '重试加载', exact: true })
    await expect(retry).toBeEnabled()
    await page.getByRole('button', { name: /保存选择/ }).click()
    await expect.poll(() => state.saves().length).toBe(1)
    await expect(retry).toBeDisabled()
    await expect(page.getByRole('button', { name: /保存选择/ })).toBeDisabled()
    const savedReads = state.savedReads().length
    // Dispatch a real DOM click without Playwright waiting for a disabled button to enable.
    await retry.evaluate((button) => (button as HTMLButtonElement).click())
    await page.getByRole('button', { name: /保存选择/ })
      .evaluate((button) => (button as HTMLButtonElement).click())
    expect(state.discoveries()).toHaveLength(1)
    expect(state.savedReads()).toHaveLength(savedReads)
    expect(state.saves()).toHaveLength(1)
    expect(state.requests.filter((request) => request.method === 'POST')).toHaveLength(0)
    state.releaseSave()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(state.saves()).toHaveLength(1)
  } finally {
    state.releaseSave()
  }
})

for (const closeMethod of ['X', 'Escape', 'backdrop'] as const) {
  test(`P2-18 慢 PUT 已提交后用 ${closeMethod} 关闭，核对中移除旧摘要并在响应后读取新群数`, async ({ page }) => {
    // Cover both a previously empty allowlist and an old nonzero count.
    const initiallySaved = closeMethod === 'X' ? [] : [retained]
    const state = await groupFixture(page, { holdSave: true, saved: initiallySaved })
    try {
      await page.goto('/')
      const summary = page.locator('.group-caption')
      await expect(summary).toHaveText(initiallySaved.length
        ? '已选择 1 个采集群'
        : '尚未选择采集群，暂不读取群消息')
      await page.getByRole('button', { name: '选择群', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: available[1].name })).toBeVisible()
      if (initiallySaved.length) await page.getByRole('checkbox', { name: retained.name }).uncheck()
      for (const group of available) await page.getByRole('checkbox', { name: group.name }).check()
      await page.getByRole('button', { name: /保存选择/ }).click()
      await expect.poll(() => state.savedGroups()).toEqual(available)
      const readsBeforeClose = state.savedReads().length
      expect(state.saves()).toHaveLength(1)

      if (closeMethod === 'X') {
        await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      } else if (closeMethod === 'Escape') {
        await page.keyboard.press('Escape')
      } else {
        const bounds = await page.getByRole('dialog').boundingBox()
        expect(bounds).not.toBeNull()
        // Native dialog backdrops receive pointer events outside the dialog rectangle.
        await page.mouse.click(bounds!.x > 4 ? bounds!.x / 2 : 2, bounds!.y > 4 ? bounds!.y / 2 : 2)
      }
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(summary).toContainText('核对中')
      await expect(summary).not.toContainText('已选择 1 个采集群')
      await expect(summary).not.toContainText('暂不读取')
      expect(state.savedReads()).toHaveLength(readsBeforeClose)
      expect(state.failedSaves).toEqual([])

      const response = page.waitForResponse((result) =>
        new URL(result.url()).pathname === `/api/v1${groupsPath}` && result.request().method() === 'PUT')
      state.releaseSave()
      const savedResponse = await response
      expect(savedResponse.status()).toBe(204)
      expect(await savedResponse.finished()).toBeNull()
      await expect.poll(() => state.savedReads().length).toBeGreaterThan(readsBeforeClose)
      await expect(summary).toHaveText('已选择 2 个采集群')
      await expect(summary).not.toContainText('核对中')
      expect(state.failedSaves).toEqual([])
      expect(state.saves()).toHaveLength(1)
      expect(state.saves()[0].body).toEqual({ groups: available })
    } finally {
      state.releaseSave()
    }
  })
}
