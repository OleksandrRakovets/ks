import { data } from 'react-router'

import { themeCookieValue, type AppTheme } from '../server/theme'

export async function action({ request }: { request: Request }) {
  const form = await request.formData()
  const raw = String(form.get('theme') ?? 'club-dark')
  const theme: AppTheme = raw === 'club-light' || raw === 'auto' ? raw : 'club-dark'
  return data({ ok: true }, { headers: { 'Set-Cookie': themeCookieValue(theme) } })
}
