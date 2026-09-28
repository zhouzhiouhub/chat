const PLATFORMS = {
  openai: ['https://api.openai.com', '/v1'],
  volcengine: ['https://ark.cn-beijing.volces.com', '/api/v3'],
  google: ['https://generativelanguage.googleapis.com', '/v1beta'],
  claude: ['https://api.anthropic.com', '/v1'],
  deepseek: ['https://api.deepseek.com', ''],
}

const FORWARDED = ['authorization', 'content-type', 'x-goog-api-key', 'x-api-key', 'anthropic-version']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/proxy/upstream' || url.pathname.startsWith('/proxy/upstream/')) {
      return forwardUpstream(request, url)
    }
    for (const name of Object.keys(PLATFORMS)) {
      const prefix = `/proxy/${name}`
      if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
        const [origin, base] = PLATFORMS[name]
        const rest = url.pathname.slice(prefix.length) || '/'
        const target = `${origin}${base}${rest}${url.search}`
        if (name === 'google') return Response.redirect(target, 307)
        return forward(request, target)
      }
    }
    return env.ASSETS.fetch(request)
  },
}

async function forwardUpstream(request, url) {
  const base = request.headers.get('x-upstream-base')
  if (!base || !/^https?:\/\//i.test(base)) return new Response('缺少上游地址', { status: 400 })
  const rest = url.pathname.replace(/^\/proxy\/upstream/, '') || '/'
  const target = `${base.replace(/\/$/, '')}${rest.startsWith('/') ? rest : `/${rest}`}${url.search}`
  return forward(request, target)
}

async function forward(request, target) {
  const headers = new Headers()
  for (const name of FORWARDED) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  })
  const out = new Headers()
  const type = response.headers.get('content-type')
  if (type) out.set('content-type', type)
  return new Response(response.body, { status: response.status, headers: out })
}
