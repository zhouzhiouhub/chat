import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const proxy = {
  '/proxy/openai': {
    target: 'https://api.openai.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/openai/, '/v1'),
  },
  '/proxy/volcengine': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/volcengine/, '/api/v3'),
  },
  '/proxy/google': {
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/google/, '/v1'),
  },
  '/proxy/claude': {
    target: 'https://api.anthropic.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/claude/, '/v1'),
  },
  '/proxy/deepseek': {
    target: 'https://api.deepseek.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/deepseek/, ''),
  },
}

async function forwardUpstream(req: IncomingMessage, res: ServerResponse) {
  const header = req.headers['x-upstream-base']
  const base = Array.isArray(header) ? header[0] : header
  if (!base || !/^https?:\/\//i.test(base)) {
    res.statusCode = 400
    res.end('缺少上游地址')
    return
  }
  const raw = req.url ?? '/'
  const path = raw.replace(/^\/proxy\/upstream/, '') || '/'
  const target = `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const headers: Record<string, string> = {}
  if (req.headers.authorization) headers.authorization = String(req.headers.authorization)
  if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    })
    res.statusCode = response.status
    const type = response.headers.get('content-type')
    if (type) res.setHeader('content-type', type)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.statusCode = 502
    res.end(error instanceof Error ? error.message : '上游请求失败')
  }
}

function upstreamProxy(): Plugin {
  return {
    name: 'upstream-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy/upstream', (req, res) => {
        void forwardUpstream(req, res)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/proxy/upstream', (req, res) => {
        void forwardUpstream(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), upstreamProxy()],
  server: {
    proxy,
    watch: { ignored: ['**/tmp-chrome-profile/**'] },
  },
  preview: { proxy },
})
