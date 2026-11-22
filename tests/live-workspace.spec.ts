import { test, expect } from '@playwright/test'

test('signed-in workspace reads real endpoints and keeps ChA and ChB replies separate', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'haa:setup:v1:real-user',
      JSON.stringify({ version: 1, completed: true, academicYear: 2026, term: 1 }),
    )
  })
  const calls: Array<{ path: string; method: string; body: any }> = []
  const turns: Array<Record<string, unknown>> = []
  let asked = false
  let silentPending = true
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/v1', '')
    const method = req.method()
    const body = req.postDataJSON()
    calls.push({ path, method, body })
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data })
    if (path === '/auth/me')
      return json({ id: 'real-user', username: 'student', display_name: '联调同学', role: 'user' })
    if (path === '/schedules')
      return json({
        items: [
          {
            id: 'real-slot',
            title: '真实课表条目',
            details: '现场课堂',
            source: 'TIMETABLE',
            start_time: url.searchParams.get('from')!.replace('00:00:00', '09:00:00'),
            end_time: url.searchParams.get('from')!.replace('00:00:00', '10:00:00'),
          },
        ],
        next_offset: 1,
      })
    if (path === '/academic/collection-policy')
      return json({ version: 1, excluded: [{ offering_id: 'excluded-course', name: '真实课程' }] })
    if (path === '/academic/offerings')
      return json({
        items: [
          {
            offering_id: 'real-course',
            name: '真实课程',
            source: 'chaoxing',
            teacher: '教师甲',
            observed_at: '2026-11-22T02:00:00+08:00',
          },
          {
            offering_id: 'excluded-course',
            name: '真实课程',
            source: 'chaoxing',
            teacher: '停采班的教师',
            observed_at: '2026-11-22T02:00:00+08:00',
          },
        ],
      })
    if (path === '/academic/items')
      return json({
        items: [
          {
            item_id: 'real-item',
            title: '真实课程资料',
            kind: 'material',
            text: '资料正文',
            status: 'unknown',
          },
        ],
      })
    if (path === '/chat/todos')
      return json({
        items: [
          { id: 'real-todo', status: 'open', input: { title: '真实待办', body: '待办正文' } },
        ],
      })
    if (path === '/chat/notices')
      return json({
        items: [
          {
            id: 'real-notice',
            kind: 'notice',
            status: 'recorded',
            updated_at: '2026-11-22T02:00:00+08:00',
            input: { title: '真实通知', body: '通知正文', mode: 'silent', evidence: [] },
          },
        ],
        next_offset: 1,
      })
    if (path === '/chat/silent-questions')
      return json({
        items: silentPending
          ? [
              {
                question_id: 'silent-q',
                source_key: 'source-q',
                question: '后台确认问题',
                type: 'CHOICE',
                options: [{ id: 'yes', label: '认识这条通知' }],
              },
            ]
          : [],
      })
    if (path === '/chat/silent-questions/silent-q/answers') {
      silentPending = false
      return json({
        run_id: 'resume-silent',
        result: { status: 'COMPLETED', summary: '已处理后台问题' },
      })
    }
    if (path === '/chat/threads' && method === 'POST')
      return json({ thread_id: 'live-thread' }, 201)
    if (path === '/chat/threads/live-thread')
      return json({
        turns,
        pending_questions: asked
          ? [
              {
                question_id: 'chat-q',
                question: '对话里的追问',
                type: 'CHOICE',
                options: [{ id: 'friday', label: '选周五' }],
              },
            ]
          : [],
      })
    if (path.endsWith('/messages')) {
      asked = true
      const t = {
        turn_id: 't1',
        kind: 'message',
        message: body.message,
        state: 'completed',
        output: { text: '已收到你的消息。', cards: [], interaction: null },
      }
      turns.push(t)
      return json(t)
    }
    if (path.endsWith('/answers')) {
      asked = false
      const t = {
        turn_id: 't2',
        kind: 'answer',
        message: body.message,
        question_id: body.question_id,
        state: 'completed',
        output: { text: '已接续原任务。', cards: [], interaction: null },
      }
      turns.push(t)
      return json(t)
    }
    throw new Error(`Unexpected API ${method} ${path}`)
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '真实课表条目' })).toBeVisible()
  await expect(page.getByRole('button', { name: /真实待办/ })).toBeVisible()
  await expect(page.getByText('本地示例快照', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查看真实课程详情' })).toHaveCount(1)
  await expect(page.getByText('停采班的教师')).toHaveCount(0)
  await page.getByRole('button', { name: '查看真实课程详情' }).click()
  await expect(page.getByRole('button', { name: /真实课程资料/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await page.getByLabel('向学习助手提问').fill('查一下课程')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByText('对话里的追问')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await page.getByRole('button', { name: '选周五' }).click()
  await expect(page.getByText('已接续原任务。')).toBeVisible()
  expect(
    calls.find((call) => call.path === '/chat/threads/live-thread/answers')?.body,
  ).toMatchObject({ question_id: 'chat-q', message: '选周五' })
  expect(calls.filter((call) => call.path.endsWith('/messages'))).toHaveLength(1)
  await page.getByRole('button', { name: '关闭学习助手' }).click()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: /真实通知/ }).click()
  await expect(page.getByText('通知正文')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /后台确认问题/ }).click()
  await page.getByRole('button', { name: '认识这条通知' }).click()
  await expect
    .poll(() => calls.find((call) => call.path === '/chat/silent-questions/silent-q/answers')?.body)
    .toMatchObject({ source_key: 'source-q', answer: 'yes' })
})

test('demo view remains separate and never requests live workspace data', async ({ page }) => {
  const calls: string[] = []
  await page.route('**/api/v1/**', (route) => {
    calls.push(route.request().url())
    return route.fulfill({ status: 500, json: {} })
  })
  await page.goto('/?demo=1')
  await expect(page.getByText('本地示例快照', { exact: false })).toBeVisible()
  expect(calls).toEqual([])
})
