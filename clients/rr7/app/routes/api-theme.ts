import { data } from 'react-router'

import { themeCookieValue, type AppTheme } from '../server/theme'

export async function action({ request }: { request: Request }) {
  const form = await request.formData()
  const raw = String(form.get('theme') ?? 'dark')
  const theme: AppTheme = raw === 'light' || raw === 'auto' ? raw : 'dark'
  return data({ ok: true }, { headers: { 'Set-Cookie': themeCookieValue(theme) } })
}
