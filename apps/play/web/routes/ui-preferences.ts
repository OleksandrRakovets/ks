import type { SupportedLocale } from '@ks/i18n'
import { data } from 'react-router'

import { localeCookieValue, normalizeLocale } from '../server/locale'
import { type AppTheme, themeCookieValue } from '../server/theme'

type PreferenceKind = 'locale' | 'theme'

export async function action({ params, request }: { params: { preference?: string }; request: Request }) {
  const preferenceKind = preferenceKindFromParam(params.preference)
  if (preferenceKind === null) {
    throw new Response('Unknown UI preference', { status: 404 })
  }

  const cookie =
    preferenceKind === 'locale'
      ? await localeCookieFromRequest(request)
      : await themeCookieFromRequest(request)
  return data({ ok: true }, { headers: { 'Set-Cookie': cookie } })
}

function preferenceKindFromParam(value: string | undefined): PreferenceKind | null {
  if (value === 'locale') return 'locale'
  if (value === 'theme') return 'theme'
  return null
}

function normalizeTheme(value: string | null | undefined): AppTheme {
  if (value === 'club-light' || value === 'auto') return value
  return 'club-dark'
}

async function localeCookieFromRequest(request: Request): Promise<string> {
  const form = await request.formData()
  const locale: SupportedLocale = normalizeLocale(String(form.get('locale') ?? 'en'))
  return localeCookieValue(locale)
}

async function themeCookieFromRequest(request: Request): Promise<string> {
  const form = await request.formData()
  const theme = normalizeTheme(String(form.get('theme') ?? 'club-dark'))
  return themeCookieValue(theme)
}
