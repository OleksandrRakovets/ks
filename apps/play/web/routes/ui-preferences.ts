import { data } from 'react-router'
import * as v from 'valibot'

import { themeCookieValue } from '@/.server/theme'
import type { AppTheme } from '@/theme'

export async function action({ request }: { request: Request }) {
  const cookie = await themeCookieFromRequest(request)

  return data({ ok: true }, { headers: { 'Set-Cookie': cookie } })
}

function normalizeTheme(value: string | null | undefined): AppTheme {
  if (value === 'club-light' || value === 'auto') return value

  return 'club-dark'
}

async function themeCookieFromRequest(request: Request): Promise<string> {
  const form = await request.formData()
  const value = v.safeParse(v.string(), form.get('theme'))
  const theme = normalizeTheme(value.success ? value.output : undefined)

  return themeCookieValue(theme)
}
