export function badRequest(message: string): Response {
  return Response.json({ ok: false, error: message }, { status: 400 })
}

export function unauthorized(): Response {
  return new Response('Unauthorized', { status: 401 })
}
