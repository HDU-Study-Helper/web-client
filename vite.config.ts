import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

// A development reverse proxy has two distinct origins. Validate the browser's
// origin BEFORE adapting it to the backend's configured PUBLIC_ORIGIN.
function browserOriginGuard(): Plugin {
  function guard(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const proxied = ['/api', '/admin'].some((prefix) => request.url?.startsWith(prefix))
    if (proxied && !['GET', 'HEAD', 'OPTIONS'].includes(request.method || '')) {
      const protocol = (request.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
      if (request.headers.origin !== `${protocol}://${request.headers.host}`) {
        response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(
          JSON.stringify({
            error: { code: 'forbidden', message: '请求来源校验失败', retryable: false },
          }),
        )
        return
      }
    }
    next()
  }
  return {
    name: 'haa-browser-origin-guard',
    configureServer(server) {
      server.middlewares.use(guard)
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.HAA_API_TARGET || 'http://127.0.0.1:2610'
  const backendOrigin = env.HAA_BACKEND_ORIGIN || new URL(target).origin
  const proxy = {
    target,
    changeOrigin: true,
    configure(proxy: import('vite').HttpProxy.Server) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(incoming.method || '')) {
          outgoing.setHeader('Origin', backendOrigin)
        }
      })
    },
  }
  return {
    plugins: [browserOriginGuard(), react()],
    server: { port: 5173, strictPort: true, proxy: { '/api': proxy, '/admin': proxy } },
    preview: { port: 4173, proxy: { '/api': proxy, '/admin': proxy } },
  }
})
