export async function action() {
  return Response.json({ ok: false, error: 'Admin create route is temporarily disabled' }, { status: 410 })
}

export default function AdminCreateRoute() {
  return null
}
