export function json(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  })
}

export function badRequest(message: string): Response {
  return json({ ok: false, error: message }, { status: 400 })
}

export function unauthorized(): Response {
  return new Response('Unauthorized', { status: 401 })
}
