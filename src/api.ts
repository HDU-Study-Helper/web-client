export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return '用户名或密码错误，或登录已过期，请重新登录。'
    if (error.code === 'auth_required' || error.code === 'auth_expired')
      return '平台登录已过期，请重新连接。'
    if (error.code === 'verification_required')
      return '平台需要额外验证，请在官方平台完成验证后重试。'
    if (error.status === 403) return '请求未通过权限或来源校验，请刷新页面后重试。'
    if (error.status === 429) return '操作较频繁，请稍后重试。'
    if (error.status === 503) return '此服务暂时不可用，请稍后重试或联系管理员。'
    if (error.code === 'unsupported') return '当前服务尚不支持此操作。'
    return error.message
  }
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。'
}

export async function api<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    signal?: AbortSignal
    sessionCheck?: boolean
    timeoutMs?: number
  } = {},
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' })
  const method = options.method || 'GET'
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD'].includes(method)) {
    const csrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('academic_csrf='))
      ?.split('=')
      .slice(1)
      .join('=')
    if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  }
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.any([
        AbortSignal.timeout(options.timeoutMs ?? 120_000),
        ...(options.signal ? [options.signal] : []),
      ]),
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? '请求超时，请重试。导入课表前可先检查是否已完成。'
        : '无法连接服务，请检查网络后重试。',
    )
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && options.sessionCheck !== false)
      window.dispatchEvent(new Event('haa:session-expired'))
    if (
      response.status === 404 &&
      ['/platforms/sources', '/platforms/connections', '/dws/connections'].includes(path)
    ) {
      throw new ApiError(
        404,
        'backend_incomplete',
        '当前后端未提供平台连接服务，请联系管理员检查服务配置。',
        data?.request_id,
      )
    }
    throw new ApiError(
      response.status,
      data?.error?.code || 'http_error',
      data?.error?.message || '服务暂时无法完成请求，请稍后重试。',
      data?.request_id,
    )
  }
  if (data === null) throw new Error('服务返回了无法识别的数据，请稍后重试。')
  return data as T
}

export const connectionPath = (id: string) => `/platforms/connections/${encodeURIComponent(id)}`
export const dwsPath = (id: string) => `/dws/connections/${encodeURIComponent(id)}`
export const activeConnection = (connections: import('./types').Connection[], source?: string) =>
  connections.find((c) => c.enabled && c.state === 'active' && (!source || c.source === source))

export function safeHTTPS(value?: string): string | undefined {
  if (!value) return
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href
  } catch {
    /* Ignore invalid upstream URLs. */
  }
}
