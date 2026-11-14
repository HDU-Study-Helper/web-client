import { test, expect } from '@playwright/test'
import { createServer as createHTTPServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'

test('开发代理拒绝跨源写入，并保留后端 Cookie / CSRF 验证材料', async () => {
  const received: {
    origin?: string
    host?: string
    csrf?: string
    cookie?: string
    body: string
  }[] = []
  const upstream = createHTTPServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk.toString()
    received.push({
      origin: request.headers.origin,
      host: request.headers.host,
      csrf: request.headers['x-csrf-token'] as string | undefined,
      cookie: request.headers.cookie,
      body,
    })
    response.setHeader('Content-Type', 'application/json')
    response.setHeader(
      'Set-Cookie',
      'academic_session=synthetic; HttpOnly; SameSite=Strict; Path=/',
    )
    response.end(JSON.stringify({ accepted: true }))
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  const oldTarget = process.env.HAA_API_TARGET
  const oldOrigin = process.env.HAA_BACKEND_ORIGIN
  process.env.HAA_API_TARGET = upstreamOrigin
  process.env.HAA_BACKEND_ORIGIN = 'https://configured-backend.example'
  const server = await createViteServer({
    configFile: resolve('vite.config.ts'),
    logLevel: 'silent',
    server: { port: 15173, strictPort: false, host: '127.0.0.1', hmr: false },
  })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`
    const path = `${origin}/api/v1/auth/login`
    for (const foreign of ['https://unrelated.example', 'null', '']) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { ...(foreign ? { Origin: foreign } : {}), 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(response.status).toBe(403)
    }
    expect(received).toHaveLength(0)
    const body = JSON.stringify({ username: 'synthetic-user', password: 'synthetic-password' })
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: 'academic_session=synthetic; academic_csrf=synthetic-csrf',
        'X-CSRF-Token': 'synthetic-csrf',
      },
      body,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(received).toEqual([
      {
        origin: 'https://configured-backend.example',
        host: new URL(upstreamOrigin).host,
        csrf: 'synthetic-csrf',
        cookie: 'academic_session=synthetic; academic_csrf=synthetic-csrf',
        body,
      },
    ])
  } finally {
    await server.close()
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    )
    if (oldTarget === undefined) delete process.env.HAA_API_TARGET
    else process.env.HAA_API_TARGET = oldTarget
    if (oldOrigin === undefined) delete process.env.HAA_BACKEND_ORIGIN
    else process.env.HAA_BACKEND_ORIGIN = oldOrigin
  }
})
